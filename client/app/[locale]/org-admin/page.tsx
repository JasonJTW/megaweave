"use client";

//* 組織管理員後台（PRD 0001 §5.1）：管理單位與成員
//* 頁面守門：middleware 只確認已登入；是否為該組織的 Org Admin（或 Platform Admin）由 server 判斷（不是就回 ORG_NOT_FOUND）
//* 身分：`role` 是 Org Admin 或 Org Member；`unitIds` 是擔任 Unit Contact 的單位，兩者可並存（ADR 0004）
//* 交接（E8-1）：窗口離職或異動後，他經手的物品與進行中的 Weave 在「待交接」轉給同單位另一位窗口
//* 自動升級（#139）：組織層級的開關與天數；單件覆寫在 /org/items
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/apiError";
import { PUBLISHER_DISPLAYS, type PublisherDisplay } from "@/lib/orgContact";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { useUser } from "@/app/contexts/UserContext";
import { Link } from "@/i18n/navigation";
import { pickOrg } from "@/lib/orgAdminRules";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

const MEMBER_ROLES = ["admin", "member"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

interface OrgOption {
  id: string;
  name: string;
}

interface OrgUnit {
  id: number;
  name: string;
}

interface OrgMember {
  id: number;
  email: string;
  role: MemberRole;
  unitIds: number[];
}

interface OrgOverview {
  org: OrgOption;
  units: OrgUnit[];
  members: OrgMember[];
}

interface MemberIdentity {
  role: MemberRole;
  unitIds: number[];
}

interface MemberForm extends MemberIdentity {
  email: string;
}

const EMPTY_MEMBER_FORM: MemberForm = {
  email: "",
  role: "member",
  unitIds: [],
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body, res.status);
  return body as T;
}

function toggleId(ids: number[], id: number, checked: boolean): number[] {
  return checked ? [...ids, id] : ids.filter((other) => other !== id);
}

/** Org Admin／Org Member 選單與 Unit Contact 單位勾選；新增與編輯成員共用 */
function IdentityFields({
  idPrefix,
  units,
  value,
  onChange,
}: {
  idPrefix: string;
  units: OrgUnit[];
  value: MemberIdentity;
  onChange: (next: MemberIdentity) => void;
}) {
  const t = useTranslations("OrgAdmin");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-role`}>{t("roleLabel")}</Label>
        <Select
          value={value.role}
          onValueChange={(role) =>
            onChange({ ...value, role: role as MemberRole })
          }
        >
          <SelectTrigger id={`${idPrefix}-role`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {t(`role.${role}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t(`roleHint.${value.role}`)}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("unitsLabel")}</legend>
        <p className="text-xs text-muted-foreground">{t("unitsHint")}</p>
        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("needUnitsFirst")}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {units.map((unit) => (
              <label key={unit.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value.unitIds.includes(unit.id)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      unitIds: toggleId(
                        value.unitIds,
                        unit.id,
                        checked === true,
                      ),
                    })
                  }
                />
                {unit.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}

interface PendingHandover {
  user: { id: string; email: string; isMember: boolean };
  unit: OrgUnit;
  itemCount: number;
  openWeaveCount: number;
}

function handoverKey(handover: PendingHandover): string {
  return `${handover.user.id}:${handover.unit.id}`;
}

/**
 * 待交接（E8-1）：離職或異動的窗口還經手著的物品，轉給同單位另一位窗口。
 * 接手人選項 = 該單位現任窗口，扣掉交出的人
 */
function HandoverCard({
  orgUrl,
  members,
  onDone,
}: {
  orgUrl: string;
  members: OrgMember[];
  onDone: () => Promise<unknown>;
}) {
  const t = useTranslations("OrgAdmin.handover");
  const errorMessage = useApiErrorMessage();
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const { data, error, mutate } = useSWR(`${orgUrl}/handovers`, (url: string) =>
    requestJson<{ handovers: PendingHandover[] }>(url),
  );

  async function handOver(handover: PendingHandover) {
    const key = handoverKey(handover);
    const toMemberId = Number(targets[key]);
    if (!toMemberId) return;
    setSubmitting(key);
    try {
      const result = await requestJson<{ items: number; weaves: number }>(
        `${orgUrl}/handovers`,
        {
          method: "POST",
          body: JSON.stringify({
            fromUserId: handover.user.id,
            unitId: handover.unit.id,
            toMemberId,
          }),
        },
      );
      toast.success(t("done", result));
      await Promise.all([mutate(), onDone()]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <p className="text-sm text-destructive">{errorMessage(error)}</p>
        )}
        {data && data.handovers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        {data && data.handovers.length > 0 && (
          <ul className="space-y-2">
            {data.handovers.map((handover) => {
              const key = handoverKey(handover);
              const candidates = members.filter(
                (m) =>
                  m.unitIds.includes(handover.unit.id) &&
                  m.email !== handover.user.email,
              );
              return (
                <li
                  key={key}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {handover.user.email}
                      </span>
                      {!handover.user.isMember && (
                        <Badge variant="outline">{t("leftOrg")}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("summary", {
                        unit: handover.unit.name,
                        items: handover.itemCount,
                        weaves: handover.openWeaveCount,
                      })}
                    </p>
                  </div>
                  {candidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("noCandidates", { unit: handover.unit.name })}
                    </p>
                  ) : (
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <Select
                        value={targets[key] ?? ""}
                        onValueChange={(value) =>
                          setTargets((prev) => ({ ...prev, [key]: value }))
                        }
                      >
                        <SelectTrigger
                          className="w-full sm:w-56"
                          aria-label={t("targetLabel", {
                            email: handover.user.email,
                            unit: handover.unit.name,
                          })}
                        >
                          <SelectValue placeholder={t("targetPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((member) => (
                            <SelectItem
                              key={member.id}
                              value={String(member.id)}
                            >
                              {member.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!targets[key] || submitting !== null}
                        onClick={() => void handOver(handover)}
                      >
                        {submitting === key ? t("submitting") : t("submit")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface OrgSettings {
  autoReleaseEnabled: boolean;
  autoReleaseDays: number;
  publisherDisplay: PublisherDisplay;
}

/** 公開層的發文者顯示（#140）：組織名稱、組織＋單位或匿名；和自動升級共用 settings 的 SWR key */
function PublisherDisplayCard({ orgUrl }: { orgUrl: string }) {
  const t = useTranslations("OrgAdmin.publisherDisplay");
  const errorMessage = useApiErrorMessage();
  const { data, error, mutate } = useSWR(`${orgUrl}/settings`, (url: string) =>
    requestJson<{ settings: OrgSettings }>(url),
  );
  const [saving, setSaving] = useState(false);
  const { mutate: revalidate } = useSWRConfig();
  const current = data?.settings.publisherDisplay;

  async function change(value: PublisherDisplay) {
    if (value === current) return;
    setSaving(true);
    try {
      const result = await requestJson<{ settings: OrgSettings }>(
        `${orgUrl}/settings`,
        { method: "PATCH", body: JSON.stringify({ publisherDisplay: value }) },
      );
      await mutate(result, { revalidate: false });
      //* 公開物品的卡片、詳情都換了名稱
      await revalidate(
        (key) => typeof key === "string" && key.startsWith(`${hostName}/api/`),
      );
      toast.success(t("saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">{errorMessage(error)}</p>
        )}
        {current && (
          <div className="space-y-2">
            <Label htmlFor="org-publisher-display">{t("label")}</Label>
            <Select
              value={current}
              disabled={saving}
              onValueChange={(value) => void change(value as PublisherDisplay)}
            >
              <SelectTrigger id="org-publisher-display" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUBLISHER_DISPLAYS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`option.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 組織的自動升級設定：自動（天數）或手動 */
function AutoReleaseCard({ orgUrl }: { orgUrl: string }) {
  const t = useTranslations("OrgAdmin.settings");
  const errorMessage = useApiErrorMessage();
  const { data, error, mutate } = useSWR(`${orgUrl}/settings`, (url: string) =>
    requestJson<{ settings: OrgSettings }>(url),
  );
  const [draft, setDraft] = useState<{ enabled: boolean; days: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const { mutate: revalidate } = useSWRConfig();

  const settings = data?.settings;
  const enabled = draft?.enabled ?? settings?.autoReleaseEnabled ?? true;
  const days = draft?.days ?? String(settings?.autoReleaseDays ?? 30);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await requestJson<{ settings: OrgSettings }>(
        `${orgUrl}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(
            enabled
              ? { autoReleaseEnabled: true, autoReleaseDays: Number(days) }
              : { autoReleaseEnabled: false },
          ),
        },
      );
      await mutate(result, { revalidate: false });
      setDraft(null);
      //* /org/items 的「跟組織設定」標示來自 GET /api/orgs
      await revalidate(
        (key) =>
          typeof key === "string" && key.startsWith(`${hostName}/api/orgs`),
      );
      toast.success(t("saved"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">{errorMessage(error)}</p>
        )}
        {settings && (
          <form className="space-y-4" onSubmit={save}>
            <div className="flex items-center gap-3">
              <Switch
                id="org-auto-release-enabled"
                checked={enabled}
                onCheckedChange={(checked) =>
                  setDraft({ enabled: checked, days })
                }
              />
              <Label htmlFor="org-auto-release-enabled">
                {t("enabledLabel")}
              </Label>
            </div>
            {enabled ? (
              <div className="space-y-2">
                <Label htmlFor="org-auto-release-days">{t("daysLabel")}</Label>
                <Input
                  id="org-auto-release-days"
                  type="number"
                  min={1}
                  max={365}
                  required
                  className="w-32"
                  value={days}
                  onChange={(e) => setDraft({ enabled, days: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("daysHint")}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("manualHint")}</p>
            )}
            <Button type="submit" disabled={saving || draft === null}>
              {t("save")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function OrgAdminContent() {
  const t = useTranslations("OrgAdmin");
  const errorMessage = useApiErrorMessage();
  const { user } = useUser();
  //* 從 /admin/orgs、組織頁帶 `?org=` 進來時先選那個組織
  const searchParams = useSearchParams();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    searchParams.get("org"),
  );
  const [unitName, setUnitName] = useState("");
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_MEMBER_FORM);
  const [editing, setEditing] = useState<{
    memberId: number;
    identity: MemberIdentity;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { mutate: revalidate } = useSWRConfig();

  const { data: orgList, error: orgListError } = useSWR(
    `${hostName}/api/org-admin/orgs`,
    (url) => requestJson<{ orgs: OrgOption[] }>(url),
  );
  const orgs = orgList?.orgs ?? [];
  const currentOrg = pickOrg(orgs, selectedOrgId);
  const orgId = currentOrg?.id ?? null;
  const orgUrl = orgId ? `${hostName}/api/org-admin/orgs/${orgId}` : null;
  const {
    data: overview,
    error: overviewError,
    mutate,
  } = useSWR(orgUrl, (url: string) => requestJson<OrgOverview>(url));

  const unitNames = new Map(overview?.units.map((u) => [u.id, u.name]));

  async function run(action: () => Promise<void>, success: string) {
    setSubmitting(true);
    try {
      await action();
      toast.success(success);
      //* 移除或改單位後，待交接清單也會變
      await Promise.all([mutate(), revalidate(`${orgUrl}/handovers`)]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddUnit(event: React.FormEvent) {
    event.preventDefault();
    if (!orgUrl) return;
    void run(async () => {
      await requestJson(`${orgUrl}/units`, {
        method: "POST",
        body: JSON.stringify({ name: unitName }),
      });
      setUnitName("");
    }, t("unitAdded"));
  }

  function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    if (!orgUrl) return;
    const { email, role, unitIds } = memberForm;
    void run(async () => {
      await requestJson(`${orgUrl}/members`, {
        method: "POST",
        body: JSON.stringify({ email, role, unitIds }),
      });
      setMemberForm(EMPTY_MEMBER_FORM);
    }, t("memberAdded"));
  }

  function handleRemove(member: OrgMember) {
    if (!orgUrl) return;
    if (!window.confirm(t("removeConfirm", { email: member.email }))) return;
    void run(async () => {
      await requestJson(`${orgUrl}/members/${member.id}`, {
        method: "DELETE",
      });
    }, t("memberRemoved"));
  }

  function handleSaveMember(event: React.FormEvent) {
    event.preventDefault();
    if (!orgUrl || !editing) return;
    const { memberId, identity } = editing;
    void run(async () => {
      await requestJson(`${orgUrl}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(identity),
      });
      setEditing(null);
    }, t("memberUpdated"));
  }

  const loadError = orgListError ?? overviewError;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {currentOrg && (
          <p className="text-lg font-semibold">{currentOrg.name}</p>
        )}
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        {orgId && (
          <Link
            href={`/org/items?org=${orgId}`}
            className="inline-block text-sm underline"
          >
            {t("manageItemsLink")}
          </Link>
        )}
        {orgId && (
          <Link
            href={`/org-admin/report?org=${orgId}`}
            className="ml-4 inline-block text-sm underline"
          >
            {t("reportLink")}
          </Link>
        )}
      </header>

      {loadError && (
        <p className="text-sm text-destructive">
          {errorMessage(loadError, t("loadFailed"))}
        </p>
      )}
      {orgList && orgList.orgs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrgs")}</p>
      )}

      {orgList && orgList.orgs.length > 1 && orgId && (
        <div className="space-y-2">
          <Label htmlFor="org-admin-org">{t("orgLabel")}</Label>
          <Select value={orgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger id="org-admin-org" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orgList.orgs.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {overview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("unitsHeading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {overview.units.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("unitsEmpty")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {overview.units.map((unit) => (
                    <li key={unit.id}>
                      <Badge variant="secondary">{unit.name}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={handleAddUnit}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="org-unit-name">{t("unitNameLabel")}</Label>
                  <Input
                    id="org-unit-name"
                    required
                    maxLength={100}
                    placeholder={t("unitNamePlaceholder")}
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="sm:w-auto sm:shrink-0"
                  disabled={submitting}
                >
                  {submitting ? t("saving") : t("addUnit")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("membersHeading")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form className="space-y-4" onSubmit={handleAddMember}>
                <div className="space-y-2">
                  <Label htmlFor="org-member-email">{t("emailLabel")}</Label>
                  <Input
                    id="org-member-email"
                    type="email"
                    required
                    value={memberForm.email}
                    onChange={(e) =>
                      setMemberForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("emailHint")}
                  </p>
                </div>

                <IdentityFields
                  idPrefix="org-member"
                  units={overview.units}
                  value={memberForm}
                  onChange={(identity) =>
                    setMemberForm((prev) => ({ ...prev, ...identity }))
                  }
                />

                <Button type="submit" disabled={submitting}>
                  {submitting ? t("saving") : t("addMember")}
                </Button>
              </form>

              {overview.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("membersEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {overview.members.map((member) =>
                    editing?.memberId === member.id ? (
                      <li key={member.id} className="rounded-lg border p-4">
                        <form className="space-y-4" onSubmit={handleSaveMember}>
                          <p className="truncate font-medium">{member.email}</p>
                          <IdentityFields
                            idPrefix={`org-member-${member.id}`}
                            units={overview.units}
                            value={editing.identity}
                            onChange={(identity) =>
                              setEditing({ memberId: member.id, identity })
                            }
                          />
                          <div className="flex gap-2">
                            <Button type="submit" disabled={submitting}>
                              {submitting ? t("saving") : t("save")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={submitting}
                              onClick={() => setEditing(null)}
                            >
                              {t("cancel")}
                            </Button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={member.id}
                        className="flex items-start justify-between gap-4 rounded-lg border p-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">
                              {member.email}
                            </span>
                            {member.email === user?.email && (
                              <Badge variant="outline">{t("you")}</Badge>
                            )}
                            <Badge variant="secondary">
                              {t(`role.${member.role}`)}
                            </Badge>
                            {member.unitIds.length > 0 && (
                              <Badge variant="secondary">
                                {t("unitContact")}
                              </Badge>
                            )}
                          </div>
                          {member.unitIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {member.unitIds
                                .map((id) => unitNames.get(id))
                                .join("、")}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() =>
                              setEditing({
                                memberId: member.id,
                                identity: {
                                  role: member.role,
                                  unitIds: member.unitIds,
                                },
                              })
                            }
                          >
                            {t("edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleRemove(member)}
                          >
                            {t("remove")}
                          </Button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <AutoReleaseCard key={orgUrl} orgUrl={orgUrl!} />
          <PublisherDisplayCard key={`${orgUrl}-display`} orgUrl={orgUrl!} />

          <HandoverCard
            orgUrl={orgUrl!}
            members={overview.members}
            onDone={() => mutate()}
          />
        </>
      )}
    </main>
  );
}

export default function OrgAdminPage() {
  return (
    <Suspense>
      <OrgAdminContent />
    </Suspense>
  );
}
