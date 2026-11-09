"use client";

//* 組織管理員後台（PRD 0001 §5.1）：管理單位與成員
//* 頁面守門：middleware 只確認已登入；是否為該組織的 Org Admin（或 Platform Admin）由 server 判斷（不是就回 ORG_NOT_FOUND）
//* 身分：`role` 是 Org Admin 或 Org Member；`unitIds` 是擔任 Unit Contact 的單位，兩者可並存（ADR 0004）
//* 交接（E8-1）：窗口離職或異動後，他經手的物品與進行中的 Weave 在「待交接」轉給同單位另一位窗口；
//* 有待交接時這一區排在最上面，沒有時放到最後
//* 自動升級（#139）：組織層級的開關與天數；單件覆寫在 /org/items
//* 版面：設定頁的「左欄說明、右欄面板」，每一區各自存檔
import { type ReactNode, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { pickOrg } from "@/lib/orgAdminRules";
import { cn } from "@/lib/utils";
import {
  compactButton,
  OrgNotice,
  OrgShell,
  orgTabs,
} from "@/components/org/OrgShell";

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

/** 設定頁的一區：左欄標題與說明，右欄面板 */
function SettingsSection({
  title,
  hint,
  aside,
  children,
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div className="space-y-2">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
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
          <SelectTrigger
            id={`${idPrefix}-role`}
            className="h-[38px] text-base sm:w-64"
          >
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
          <div className="flex flex-wrap gap-2 pt-1">
            {units.map((unit) => {
              const checked = value.unitIds.includes(unit.id);
              return (
                <label
                  key={unit.id}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
                    checked
                      ? "border-primary bg-primary-15"
                      : "border-primary-30 bg-white hover:bg-primary-5",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      onChange({
                        ...value,
                        unitIds: toggleId(
                          value.unitIds,
                          unit.id,
                          next === true,
                        ),
                      })
                    }
                  />
                  {unit.name}
                </label>
              );
            })}
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

function useHandovers(orgUrl: string) {
  return useSWR(`${orgUrl}/handovers`, (url: string) =>
    requestJson<{ handovers: PendingHandover[] }>(url),
  );
}

/**
 * 待交接（E8-1）：離職或異動的窗口還經手著的物品，轉給同單位另一位窗口。
 * 接手人選項 = 該單位現任窗口，扣掉交出的人
 */
function HandoverSection({
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
  const { data, error, mutate } = useHandovers(orgUrl);

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

  const count = data?.handovers.length ?? 0;
  return (
    <SettingsSection
      title={count > 0 ? t("headingCount", { count }) : t("heading")}
      hint={t("hint")}
    >
      {error && <OrgNotice tone="error">{errorMessage(error)}</OrgNotice>}
      {data && count === 0 && <OrgNotice>{t("empty")}</OrgNotice>}
      {data && count > 0 && (
        <ul className="divide-y rounded-lg border border-amber-200 bg-amber-50/40">
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
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {handover.user.email}
                    </span>
                    {!handover.user.isMember && (
                      <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-xs font-medium text-dark">
                        {t("leftOrg")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("summary", {
                      unit: handover.unit.name,
                      items: handover.itemCount,
                      weaves: handover.openWeaveCount,
                    })}
                  </p>
                </div>
                {candidates.length === 0 ? (
                  <p className="text-sm text-amber-900">
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
                        className="h-9 w-full text-sm sm:w-64"
                        aria-label={t("targetLabel", {
                          email: handover.user.email,
                          unit: handover.unit.name,
                        })}
                      >
                        <SelectValue placeholder={t("targetPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((member) => (
                          <SelectItem key={member.id} value={String(member.id)}>
                            {member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(compactButton, "h-9 px-4")}
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
    </SettingsSection>
  );
}

interface OrgSettings {
  autoReleaseEnabled: boolean;
  autoReleaseDays: number;
  publisherDisplay: PublisherDisplay;
}

/** 公開層的發文者顯示（#140）：組織名稱、組織＋單位或匿名；和自動升級共用 settings 的 SWR key */
function PublisherDisplaySection({
  orgUrl,
  orgName,
  sampleUnit,
}: {
  orgUrl: string;
  orgName: string;
  sampleUnit: string | null;
}) {
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

  //* 與 server orgPublisher 的組法相同：「組織 · 單位」
  const preview =
    current === "anonymous"
      ? t("option.anonymous")
      : current === "org_unit"
        ? `${orgName} · ${sampleUnit ?? t("sampleUnit")}`
        : orgName;

  return (
    <SettingsSection title={t("heading")} hint={t("hint")}>
      {error && <OrgNotice tone="error">{errorMessage(error)}</OrgNotice>}
      {current && (
        <div className="space-y-4 rounded-lg border p-5">
          <div className="space-y-2">
            <Label htmlFor="org-publisher-display">{t("label")}</Label>
            <Select
              value={current}
              disabled={saving}
              onValueChange={(value) => void change(value as PublisherDisplay)}
            >
              <SelectTrigger
                id="org-publisher-display"
                className="h-[38px] text-base sm:w-64"
              >
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
          <p className="rounded-lg bg-primary-5 px-3 py-2 text-sm">
            {t("preview")}
            <span className="ml-2 font-medium">{preview}</span>
          </p>
        </div>
      )}
    </SettingsSection>
  );
}

/** 組織的自動升級設定：自動（天數）或手動 */
function AutoReleaseSection({ orgUrl }: { orgUrl: string }) {
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
    <SettingsSection title={t("heading")} hint={t("hint")}>
      {error && <OrgNotice tone="error">{errorMessage(error)}</OrgNotice>}
      {settings && (
        <form className="space-y-4 rounded-lg border p-5" onSubmit={save}>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="org-auto-release-enabled">
              {t("enabledLabel")}
            </Label>
            <Switch
              id="org-auto-release-enabled"
              checked={enabled}
              onCheckedChange={(checked) =>
                setDraft({ enabled: checked, days })
              }
            />
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
                clearable={false}
                className="w-32 tabular-nums"
                value={days}
                onChange={(e) => setDraft({ enabled, days: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t("daysHint")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("manualHint")}</p>
          )}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {draft !== null && (
              <span className="text-xs text-muted-foreground">
                {t("unsaved")}
              </span>
            )}
            <Button
              type="submit"
              className="w-auto"
              disabled={saving || draft === null}
            >
              {t("save")}
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}

function OrgAdminContent() {
  const t = useTranslations("OrgAdmin");
  const errorMessage = useApiErrorMessage();
  const { user } = useUser();
  //* 從 /admin/orgs、組織頁帶 `?org=` 進來時先選那個組織；切換組織也寫回網址
  const searchParams = useSearchParams();
  const [unitName, setUnitName] = useState("");
  const [adding, setAdding] = useState(false);
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
  const currentOrg = pickOrg(orgs, searchParams.get("org"));
  const orgId = currentOrg?.id ?? null;
  const orgUrl = orgId ? `${hostName}/api/org-admin/orgs/${orgId}` : null;
  const {
    data: overview,
    error: overviewError,
    mutate,
  } = useSWR(orgUrl, (url: string) => requestJson<OrgOverview>(url));
  //* 和 HandoverSection 共用 SWR key：只用來決定這一區排在最上面還是最後
  const { data: handovers } = useSWR(
    orgUrl ? `${orgUrl}/handovers` : null,
    (url: string) => requestJson<{ handovers: PendingHandover[] }>(url),
  );
  const handoverFirst = (handovers?.handovers.length ?? 0) > 0;

  const unitNames = new Map(overview?.units.map((u) => [u.id, u.name]));

  async function run(action: () => Promise<void>, success: string) {
    setSubmitting(true);
    try {
      await action();
      toast.success(success);
      //* 移除或改單位後，待交接清單也會變
      await Promise.all([mutate(), revalidate(`${orgUrl}/handovers`)]);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
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
      setAdding(false);
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
  const handoverSection = overview && orgUrl && (
    <HandoverSection
      key={`${orgUrl}-handover`}
      orgUrl={orgUrl}
      members={overview.members}
      onDone={() => mutate()}
    />
  );

  return (
    <OrgShell
      orgs={orgs}
      org={currentOrg}
      switchPath="/org-admin"
      tabs={orgTabs({ isAdmin: true, canManage: true })}
      current="admin"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {loadError && (
        <OrgNotice tone="error">
          {errorMessage(loadError, t("loadFailed"))}
        </OrgNotice>
      )}
      {orgList && orgList.orgs.length === 0 && (
        <OrgNotice>{t("noOrgs")}</OrgNotice>
      )}
      {orgUrl && !overview && !loadError && (
        <OrgNotice>{t("loading")}</OrgNotice>
      )}

      {overview && orgUrl && (
        <div>
          {handoverFirst && handoverSection}

          <SettingsSection
            title={t("membersHeading")}
            hint={t("membersHint", { count: overview.members.length })}
            aside={
              !adding && (
                <Button
                  type="button"
                  className="mt-2 w-auto"
                  onClick={() => {
                    setEditing(null);
                    setAdding(true);
                  }}
                >
                  {t("addMember")}
                </Button>
              )
            }
          >
            <div className="space-y-4">
              {adding && (
                <form
                  className="space-y-4 rounded-lg border border-primary-30 bg-primary-5 p-5"
                  onSubmit={handleAddMember}
                >
                  <div className="space-y-2">
                    <Label htmlFor="org-member-email">{t("emailLabel")}</Label>
                    <Input
                      id="org-member-email"
                      type="email"
                      required
                      autoFocus
                      className="bg-white sm:max-w-md"
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

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-auto"
                      disabled={submitting}
                      onClick={() => {
                        setAdding(false);
                        setMemberForm(EMPTY_MEMBER_FORM);
                      }}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="submit"
                      className="w-auto"
                      disabled={submitting}
                    >
                      {submitting ? t("saving") : t("addMember")}
                    </Button>
                  </div>
                </form>
              )}

              {overview.members.length === 0 ? (
                <OrgNotice>{t("membersEmpty")}</OrgNotice>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <div
                    aria-hidden
                    className="hidden grid-cols-[minmax(0,2fr)_112px_minmax(0,1fr)_128px] gap-4 border-b px-4 py-2.5 text-xs text-muted-foreground md:grid"
                  >
                    <span>{t("emailLabel")}</span>
                    <span>{t("roleLabel")}</span>
                    <span>{t("unitContact")}</span>
                    <span />
                  </div>
                  <ul className="divide-y">
                    {overview.members.map((member) =>
                      editing?.memberId === member.id ? (
                        <li key={member.id} className="bg-primary-5 p-4">
                          <form
                            className="space-y-4"
                            onSubmit={handleSaveMember}
                          >
                            <p className="truncate font-medium">
                              {member.email}
                            </p>
                            <IdentityFields
                              idPrefix={`org-member-${member.id}`}
                              units={overview.units}
                              value={editing.identity}
                              onChange={(identity) =>
                                setEditing({ memberId: member.id, identity })
                              }
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-auto"
                                disabled={submitting}
                                onClick={() => setEditing(null)}
                              >
                                {t("cancel")}
                              </Button>
                              <Button
                                type="submit"
                                className="w-auto"
                                disabled={submitting}
                              >
                                {submitting ? t("saving") : t("save")}
                              </Button>
                            </div>
                          </form>
                        </li>
                      ) : (
                        <li
                          key={member.id}
                          className="grid gap-2 px-4 py-3 transition-colors hover:bg-[#fafaf9] md:grid-cols-[minmax(0,2fr)_112px_minmax(0,1fr)_128px] md:items-center md:gap-4"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                              {member.email}
                            </span>
                            {member.email === user?.email && (
                              <span className="inline-flex h-5 flex-none items-center rounded-full bg-secondary px-2 text-xs text-dark">
                                {t("you")}
                              </span>
                            )}
                          </div>
                          <div>
                            <span
                              className={cn(
                                "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
                                member.role === "admin"
                                  ? "bg-primary-15 text-primary"
                                  : "bg-secondary text-dark",
                              )}
                            >
                              {t(`role.${member.role}`)}
                            </span>
                          </div>
                          <p className="min-w-0 truncate text-sm text-muted-foreground">
                            {member.unitIds.length > 0 ? (
                              <>
                                <span className="md:sr-only">
                                  {t("unitContact")}：
                                </span>
                                {member.unitIds
                                  .map((id) => unitNames.get(id))
                                  .join("、")}
                              </>
                            ) : (
                              <span className="hidden md:inline">—</span>
                            )}
                          </p>
                          <div className="flex gap-1.5 md:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={compactButton}
                              disabled={submitting}
                              onClick={() => {
                                setAdding(false);
                                setEditing({
                                  memberId: member.id,
                                  identity: {
                                    role: member.role,
                                    unitIds: member.unitIds,
                                  },
                                });
                              }}
                            >
                              {t("edit")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn(
                                compactButton,
                                "border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive",
                              )}
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
                </div>
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            title={t("unitsHeading")}
            hint={t("unitsSectionHint")}
          >
            <div className="space-y-4 rounded-lg border p-5">
              {overview.units.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("unitsEmpty")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {overview.units.map((unit) => {
                    const contacts = overview.members.filter((m) =>
                      m.unitIds.includes(unit.id),
                    ).length;
                    return (
                      <li
                        key={unit.id}
                        className="inline-flex h-8 items-center gap-2 rounded-full bg-secondary px-3 text-sm"
                      >
                        <span className="font-medium">{unit.name}</span>
                        <span
                          className={cn(
                            "text-xs",
                            contacts === 0
                              ? "text-amber-900"
                              : "text-muted-foreground",
                          )}
                        >
                          {contacts === 0
                            ? t("unitNoContact")
                            : t("unitContacts", { count: contacts })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <form
                className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end"
                onSubmit={handleAddUnit}
              >
                <div className="min-w-0 flex-1 space-y-2 sm:max-w-sm">
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
                  variant="outline"
                  className="sm:w-auto"
                  disabled={submitting}
                >
                  {submitting ? t("saving") : t("addUnit")}
                </Button>
              </form>
            </div>
          </SettingsSection>

          <AutoReleaseSection key={orgUrl} orgUrl={orgUrl} />
          <PublisherDisplaySection
            key={`${orgUrl}-display`}
            orgUrl={orgUrl}
            orgName={overview.org.name}
            sampleUnit={overview.units[0]?.name ?? null}
          />

          {!handoverFirst && handoverSection}
        </div>
      )}
    </OrgShell>
  );
}

export default function OrgAdminPage() {
  return (
    <Suspense>
      <OrgAdminContent />
    </Suspense>
  );
}
