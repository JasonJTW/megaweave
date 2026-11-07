"use client";

//* 組織管理員後台（PRD 0001 §5.1）：管理單位與成員
//* 頁面守門：middleware 只確認已登入；是否為該組織的 Org Admin（或 Platform Admin）由 server 判斷（不是就回 ORG_NOT_FOUND）
//* 身分：`role` 是 Org Admin 或 Org Member；`unitIds` 是擔任 Unit Contact 的單位，兩者可並存（ADR 0004）
import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/apiError";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { useUser } from "@/app/contexts/UserContext";

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

export default function OrgAdminPage() {
  const t = useTranslations("OrgAdmin");
  const errorMessage = useApiErrorMessage();
  const { user } = useUser();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState("");
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_MEMBER_FORM);
  const [editing, setEditing] = useState<{
    memberId: number;
    identity: MemberIdentity;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: orgList, error: orgListError } = useSWR(
    `${hostName}/api/org-admin/orgs`,
    (url) => requestJson<{ orgs: OrgOption[] }>(url),
  );
  const orgId = selectedOrgId ?? orgList?.orgs[0]?.id ?? null;
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
      await mutate();
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
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
                <div className="flex-1 space-y-2">
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
                <Button type="submit" disabled={submitting}>
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
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={handleAddUnit}
              >
                <div className="flex-1 space-y-2">
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
                <Button type="submit" disabled={submitting}>
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
                  {overview.members.map((member) => (
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
                        </div>
                        {member.unitIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {member.unitIds
                              .map((id) => unitNames.get(id))
                              .join("、")}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submitting}
                        onClick={() => handleRemove(member)}
                      >
                        {t("remove")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
