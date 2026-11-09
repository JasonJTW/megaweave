"use client";

//* Platform Admin 開通組織（PRD 0001 §5.1）
//* 頁面守門：middleware 的 ADMIN_ROUTES（cookie，僅外觀）；真正的權限由 server `requireRole("admin")` 把關
//* 管理員增減：Platform Admin 在每個組織都等同 Org Admin（ADR 0003），沿用 `/api/org-admin` 的成員 API
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { compactButton, OrgNotice } from "@/components/org/OrgShell";
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
    <div className="space-y-3 rounded-lg bg-primary-5 p-4">
      {error && (
        <p className="text-sm text-destructive">
          {errorMessage(error, t("adminsLoadFailed"))}
        </p>
      )}
      {data && admins.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("adminsEmpty")}</p>
      )}
      {admins.length > 0 && (
        <ul className="divide-y divide-primary-15 rounded-2xl bg-white">
          {admins.map((admin) => (
            <li
              key={admin.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="truncate text-sm">{admin.email}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  compactButton,
                  "border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive",
                )}
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
            className="bg-white"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("addAdminHint")}</p>
        </div>
        <Button
          type="submit"
          className="sm:mb-5 sm:w-auto"
          disabled={busy || !data}
        >
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
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

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
    //* 表單在右欄（手機在清單下方）：帶到表單並聚焦名稱
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    nameRef.current?.focus({ preventScroll: true });
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

  const editingName = data?.orgs.find((o) => o.id === editingId)?.name;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-baseline gap-2 text-xl font-bold tracking-tight text-megaweave-forest-dark">
            {t("listHeading")}
            {data && (
              <span className="text-sm font-normal tabular-nums text-muted-foreground">
                {data.orgs.length}
              </span>
            )}
          </h2>
          {error && (
            <OrgNotice tone="error">
              {errorMessage(error, t("loadFailed"))}
            </OrgNotice>
          )}
          {data && data.orgs.length === 0 && (
            <OrgNotice>{t("empty")}</OrgNotice>
          )}
          {data && data.orgs.length > 0 && (
            <ul className="divide-y divide-primary-15 rounded-2xl bg-white">
              {data.orgs.map((org) => {
                const editing = editingId === org.id;
                return (
                  <li
                    key={org.id}
                    className={cn(
                      "space-y-3 p-4 transition-colors",
                      editing && "bg-primary-5",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{org.name}</span>
                          {org.isDemo && (
                            <span className="inline-flex h-6 items-center rounded-full bg-amber-50 px-2.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                              {t("demoBadge")}
                            </span>
                          )}
                          {editing && (
                            <span className="text-xs text-primary">
                              {t("editingNow")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t(`publisherDisplay.${org.publisherDisplay}`)}
                          {" · "}
                          {org.autoReleaseEnabled
                            ? t("autoReleaseOn", { days: org.autoReleaseDays })
                            : t("autoReleaseOff")}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {t("orgAdminsLabel")}：
                          {org.orgAdmins.length > 0 ? (
                            <span className="text-foreground">
                              {org.orgAdmins
                                .map((admin) => admin.email)
                                .join("、")}
                            </span>
                          ) : (
                            <span className="text-amber-900">
                              {t("noAdmins")}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className={compactButton}
                        >
                          <Link href={`/org-admin?org=${org.id}`}>
                            {t("openOrgAdmin")}
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            compactButton,
                            adminsOpenId === org.id && "bg-primary-15",
                          )}
                          aria-expanded={adminsOpenId === org.id}
                          onClick={() =>
                            setAdminsOpenId(
                              adminsOpenId === org.id ? null : org.id,
                            )
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
                          className={compactButton}
                          disabled={editing}
                          onClick={() => startEdit(org)}
                        >
                          {t("edit")}
                        </Button>
                      </div>
                    </div>
                    {adminsOpenId === org.id && (
                      <OrgAdminsEditor
                        orgId={org.id}
                        onChanged={() => mutate()}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form
          ref={formRef}
          className={cn(
            "scroll-mt-6 space-y-5 rounded-2xl bg-white p-5 lg:sticky lg:top-6",
            editingId && "border-primary-50 ring-1 ring-primary-30",
          )}
          onSubmit={handleSubmit}
        >
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-megaweave-forest-dark">
              {editingId ? t("editHeading") : t("createHeading")}
            </h2>
            {editingName && (
              <p className="text-sm text-muted-foreground">{editingName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-name">{t("nameLabel")}</Label>
            <Input
              id="org-name"
              ref={nameRef}
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
              <SelectTrigger
                id="org-publisher-display"
                className="h-[38px] text-base"
              >
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

          <div className="flex items-start justify-between gap-4 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="org-is-demo">{t("isDemoLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("isDemoHint")}</p>
            </div>
            <Switch
              id="org-is-demo"
              checked={form.isDemo}
              onCheckedChange={(checked) => update("isDemo", checked)}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
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
            {form.autoReleaseEnabled && (
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
                  clearable={false}
                  className="w-24 tabular-nums"
                  value={form.autoReleaseDays}
                  onChange={(e) => update("autoReleaseDays", e.target.value)}
                />
              </div>
            )}
          </div>

          {!editingId && (
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="org-admin-email">{t("orgAdminEmailLabel")}</Label>
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

          <div className="flex justify-end gap-2 border-t pt-4">
            {editingId && (
              <Button
                type="button"
                variant="outline"
                className="w-auto"
                onClick={resetForm}
              >
                {t("cancel")}
              </Button>
            )}
            <Button type="submit" className="w-auto" disabled={submitting}>
              {submitting ? t("saving") : editingId ? t("save") : t("create")}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
