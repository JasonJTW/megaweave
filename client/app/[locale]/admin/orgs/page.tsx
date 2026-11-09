"use client";

//* Platform Admin 開通組織（PRD 0001 §5.1）
//* 頁面守門：middleware 的 ADMIN_ROUTES（cookie，僅外觀）；真正的權限由 server `requireRole("admin")` 把關
//* 管理員增減：Platform Admin 在每個組織都等同 Org Admin（ADR 0003），沿用 `/api/org-admin` 的成員 API
import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Link } from "@/i18n/navigation";
import {
  addAdminRequest,
  demoteAdminRequest,
  type MemberRequest,
  type OrgMemberIdentity,
} from "@/lib/orgAdminRules";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface Org {
  id: string;
  name: string;
  publisherDisplay: PublisherDisplay;
  isDemo: boolean;
  autoReleaseEnabled: boolean;
  autoReleaseDays: number;
  orgAdmins: { email: string }[];
}

interface OrgForm {
  name: string;
  publisherDisplay: PublisherDisplay;
  isDemo: boolean;
  autoReleaseEnabled: boolean;
  autoReleaseDays: string;
  orgAdminEmail: string;
}

const EMPTY_FORM: OrgForm = {
  name: "",
  publisherDisplay: "org",
  isDemo: false,
  autoReleaseEnabled: true,
  autoReleaseDays: "30",
  orgAdminEmail: "",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body, res.status);
  return body as T;
}

/**
 * 組織管理員的增減。加入：已是成員就改成 Org Admin（保留窗口單位），否則以 Org Admin 身分加入；
 * 移除：降為 Org Member，帳號與成員身分保留。最後一位 Org Admin 由 server 擋下（ORG_LAST_ADMIN）
 */
function OrgAdminsEditor({
  orgId,
  onChanged,
}: {
  orgId: string;
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations("AdminOrgs");
  const errorMessage = useApiErrorMessage();
  const url = `${hostName}/api/org-admin/orgs/${orgId}`;
  const { data, error, mutate } = useSWR(url, (key: string) =>
    requestJson<{ members: OrgMemberIdentity[] }>(key),
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const admins = data?.members.filter((m) => m.role === "admin") ?? [];

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await Promise.all([mutate(), onChanged()]);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function send(request: MemberRequest) {
    return requestJson(`${url}${request.path}`, {
      method: request.method,
      body: JSON.stringify(request.body),
    });
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    const request = addAdminRequest(data.members, email);
    const added = await run(() => send(request), t("adminAdded"));
    if (added) setEmail("");
  }

  function handleRemove(member: OrgMemberIdentity) {
    if (!window.confirm(t("removeAdminConfirm", { email: member.email }))) {
      return;
    }
    void run(() => send(demoteAdminRequest(member)), t("adminRemoved"));
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {error && (
        <p className="text-sm text-destructive">
          {errorMessage(error, t("adminsLoadFailed"))}
        </p>
      )}
      {data && admins.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("adminsEmpty")}</p>
      )}
      {admins.length > 0 && (
        <ul className="space-y-2">
          {admins.map((admin) => (
            <li
              key={admin.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-sm">{admin.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => handleRemove(admin)}
              >
                {t("removeAdmin")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={handleAdd}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor={`org-${orgId}-add-admin`}>{t("addAdminLabel")}</Label>
          <Input
            id={`org-${orgId}-add-admin`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("addAdminHint")}</p>
        </div>
        <Button type="submit" disabled={busy || !data}>
          {busy ? t("saving") : t("addAdmin")}
        </Button>
      </form>
    </div>
  );
}

export default function AdminOrgsPage() {
  const t = useTranslations("AdminOrgs");
  const errorMessage = useApiErrorMessage();
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adminsOpenId, setAdminsOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, error, mutate } = useSWR(`${hostName}/api/admin/orgs`, (url) =>
    requestJson<{ orgs: Org[] }>(url),
  );

  function update<K extends keyof OrgForm>(key: K, value: OrgForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(org: Org) {
    setEditingId(org.id);
    setForm({
      name: org.name,
      publisherDisplay: org.publisherDisplay,
      isDemo: org.isDemo,
      autoReleaseEnabled: org.autoReleaseEnabled,
      autoReleaseDays: String(org.autoReleaseDays),
      orgAdminEmail: "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const settings = {
      name: form.name,
      publisherDisplay: form.publisherDisplay,
      isDemo: form.isDemo,
      autoReleaseEnabled: form.autoReleaseEnabled,
      autoReleaseDays: Number(form.autoReleaseDays),
    };
    try {
      if (editingId) {
        await requestJson(`${hostName}/api/admin/orgs/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(settings),
        });
        toast.success(t("saved"));
      } else {
        await requestJson(`${hostName}/api/admin/orgs`, {
          method: "POST",
          body: JSON.stringify({
            ...settings,
            orgAdminEmail: form.orgAdminEmail,
          }),
        });
        toast.success(t("created"));
      }
      resetForm();
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? t("editHeading") : t("createHeading")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="org-name">{t("nameLabel")}</Label>
              <Input
                id="org-name"
                required
                maxLength={100}
                placeholder={t("namePlaceholder")}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-publisher-display">
                {t("publisherDisplayLabel")}
              </Label>
              <Select
                value={form.publisherDisplay}
                onValueChange={(value) =>
                  update("publisherDisplay", value as PublisherDisplay)
                }
              >
                <SelectTrigger id="org-publisher-display">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUBLISHER_DISPLAYS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`publisherDisplay.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("publisherDisplayHint")}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="org-is-demo">{t("isDemoLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("isDemoHint")}
                </p>
              </div>
              <Switch
                id="org-is-demo"
                checked={form.isDemo}
                onCheckedChange={(checked) => update("isDemo", checked)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="org-auto-release">
                    {t("autoReleaseLabel")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("autoReleaseHint")}
                  </p>
                </div>
                <Switch
                  id="org-auto-release"
                  checked={form.autoReleaseEnabled}
                  onCheckedChange={(checked) =>
                    update("autoReleaseEnabled", checked)
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="org-auto-release-days">
                  {t("autoReleaseDaysLabel")}
                </Label>
                <Input
                  id="org-auto-release-days"
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  required
                  className="w-24"
                  value={form.autoReleaseDays}
                  onChange={(e) => update("autoReleaseDays", e.target.value)}
                />
              </div>
            </div>

            {!editingId && (
              <div className="space-y-2">
                <Label htmlFor="org-admin-email">
                  {t("orgAdminEmailLabel")}
                </Label>
                <Input
                  id="org-admin-email"
                  type="email"
                  required
                  value={form.orgAdminEmail}
                  onChange={(e) => update("orgAdminEmail", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("orgAdminEmailHint")}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? t("saving") : editingId ? t("save") : t("create")}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  {t("cancel")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("listHeading")}</h2>
        {error && (
          <p className="text-sm text-destructive">
            {errorMessage(error, t("loadFailed"))}
          </p>
        )}
        {data && data.orgs.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <ul className="space-y-2">
          {data?.orgs.map((org) => (
            <li key={org.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{org.name}</span>
                    {org.isDemo && (
                      <Badge variant="secondary">{t("demoBadge")}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(`publisherDisplay.${org.publisherDisplay}`)}
                    {" · "}
                    {org.autoReleaseEnabled
                      ? t("autoReleaseOn", { days: org.autoReleaseDays })
                      : t("autoReleaseOff")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("orgAdminsLabel")}：
                    {org.orgAdmins.map((admin) => admin.email).join("、")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/org-admin?org=${org.id}`}>
                      {t("openOrgAdmin")}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={adminsOpenId === org.id}
                    onClick={() =>
                      setAdminsOpenId(adminsOpenId === org.id ? null : org.id)
                    }
                  >
                    {adminsOpenId === org.id
                      ? t("hideAdmins")
                      : t("manageAdmins")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(org)}
                  >
                    {t("edit")}
                  </Button>
                </div>
              </div>
              {adminsOpenId === org.id && (
                <OrgAdminsEditor orgId={org.id} onChanged={() => mutate()} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
