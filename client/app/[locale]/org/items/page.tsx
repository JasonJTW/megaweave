"use client";

//* 組織物品管理（PRD 0001 §5.1 E3-2、E9-3）：Unit Contact 看自己負責單位的物品，
//* Org Admin 看全組織，可依單位、層級、狀態、申請篩選。範圍由 server 決定，這裡只送篩選條件。
//* 申請（#137）：所屬單位的任一窗口或 Org Admin 都能在這裡核可／婉拒，不限上架的人
//* 層級（#138）：窗口可把自己單位的物品從 Internal 升到 Members；Org Admin 另可降回 Internal。
//* 降級會自動婉拒看不到新層級的人的申請，有已核可的申請時 server 回 ORG_TIER_DEMOTION_BLOCKED
//* 自動升級（#139）：Internal 物品可覆寫組織設定（跟組織、自訂天數、手動）；其他層級不會自動升級，不顯示
//* 公開（#140）：Org Admin 送出 10 分鐘待公開（有財產編號要確認處分）、可取消；演示組織可跳過；可從 Public 降回
//* 去向與時間軸（#141，E9-1、E9-3）：每件物品交給了哪個單位或個人；展開看從上架到交接完成的每一步
//* 版面：一列一件物品，單位、財產編號、狀態收在名稱下方；數量與單件重量疊在同一格；
//* 申請與時間軸展開在下一列。窄螢幕時表格在自己的框裡橫向捲動，物品欄固定在左側
import { Fragment, Suspense, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  compactButton,
  OrgNotice,
  OrgShell,
  orgTabs,
} from "@/components/org/OrgShell";
import { NoUnitsNotice } from "@/components/org/NoUnitsNotice";
import { ItemTimeline } from "@/components/org/ItemTimeline";
import { PublicAction } from "@/components/org/PublicAction";
import { TierPill } from "@/components/org/TierPill";
import {
  AUDIENCE_TIERS,
  AutoReleaseOverride,
  hostName,
  ManagedOrgItem,
  ORG_ITEM_STATUSES,
  ORG_ITEM_WEAVE_STATUSES,
  OrgAccess,
  OrgItem,
  OrgItemRequest,
  OrgItemWeaveStatus,
  requestJson,
  useSelectedOrg,
} from "@/lib/orgApi";
import { isOrgListingKey, orgItemsKey } from "@/lib/orgSwrKeys";

const ALL = "all";

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Org.manage");
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className={cn(
            "h-9 w-full gap-2 text-sm sm:w-40",
            value !== ALL && "border-primary font-medium",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("all")}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const WEAVE_TONES: Record<OrgItemWeaveStatus, string> = {
  requested: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200",
  approved: "bg-primary-15 text-primary",
  completed: "bg-secondary text-dark",
};

function ItemRequests({
  org,
  item,
  onReviewed,
}: {
  org: OrgAccess;
  item: OrgItem;
  onReviewed: () => void;
}) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, error, mutate } = useSWR(
    `${hostName}/api/orgs/${org.id}/items/${item.id}/requests`,
    (url: string) => requestJson<{ requests: OrgItemRequest[] }>(url),
  );

  async function review(weaveId: number, status: "approved" | "declined") {
    setBusyId(weaveId);
    try {
      await requestJson(`${hostName}/api/weaves/${weaveId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await mutate();
      onReviewed();
    } catch (err) {
      toast.error(apiErrorMessage(err, t("manage.reviewFailed")));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (data.requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("manage.requestsEmpty")}
      </p>
    );
  }
  return (
    <section aria-label={t("manage.requestsTitle")} className="space-y-2">
      <h3 className="text-sm font-semibold">{t("manage.requestsTitle")}</h3>
      <ul className="divide-y">
        {data.requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">
                {r.receiverUnit
                  ? t("manage.requestOnBehalf", {
                      name: r.receiver.name,
                      unit: r.receiverUnit.name,
                    })
                  : t("manage.requestPersonal", { name: r.receiver.name })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("manage.requestQuantity", { quantity: r.quantity })}
                {" · "}
                {format.dateTime(new Date(r.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
                  WEAVE_TONES[r.status],
                )}
              >
                {t(`weaveStatus.${r.status}`)}
              </span>
              {r.status === "requested" && (
                <>
                  <Button
                    size="sm"
                    className={compactButton}
                    disabled={busyId !== null}
                    onClick={() => review(r.id, "approved")}
                  >
                    {t("manage.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={compactButton}
                    disabled={busyId !== null}
                    onClick={() => review(r.id, "declined")}
                  >
                    {t("manage.decline")}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 這個人在這一列能做的層級變更；Public 的升降與待公開期在 PublicAction（#140） */
function tierActionFor(org: OrgAccess, item: OrgItem) {
  //* 待公開期間不能改層級（server 回 ORG_ITEM_PENDING_PUBLIC），要先取消
  if (item.pendingPublic) return null;
  if (item.audienceTier === "internal") return "members" as const;
  if (item.audienceTier === "members" && org.isAdmin)
    return "internal" as const;
  return null;
}

function TierAction({ org, item }: { org: OrgAccess; item: OrgItem }) {
  const t = useTranslations("Org.manage");
  const apiErrorMessage = useApiErrorMessage();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const target = tierActionFor(org, item);
  if (!target) return null;

  async function change() {
    if (
      target === "internal" &&
      !window.confirm(t("demoteConfirm", { title: item.title }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await requestJson(
        `${hostName}/api/orgs/${org.id}/items/${item.id}/tier`,
        {
          method: "PATCH",
          body: JSON.stringify({ tier: target }),
        },
      );
      //* 組織頁與所有篩選組合的清單都要重抓（SWR dedupe，見 orgSwrKeys）
      await mutate(isOrgListingKey(hostName, org.id));
      toast.success(target === "members" ? t("promoted") : t("demoted"));
    } catch (err) {
      toast.error(apiErrorMessage(err, t("tierChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={compactButton}
      disabled={busy}
      onClick={change}
    >
      {target === "members" ? t("promoteToMembers") : t("demoteToInternal")}
    </Button>
  );
}

type AutoReleaseMode = "org" | AutoReleaseOverride;

/** 單件自動升級覆寫：選單 + 自訂天數；只出現在 Internal 物品（只有 Internal → Members 會自動） */
function AutoReleaseControl({ org, item }: { org: OrgAccess; item: OrgItem }) {
  const t = useTranslations("Org.manage");
  const apiErrorMessage = useApiErrorMessage();
  const { mutate } = useSWRConfig();
  const saved: AutoReleaseMode = item.autoRelease.override ?? "org";
  const [mode, setMode] = useState<AutoReleaseMode>(saved);
  const [days, setDays] = useState(
    String(item.autoRelease.days ?? org.autoRelease.days),
  );
  const [busy, setBusy] = useState(false);

  if (item.audienceTier !== "internal") {
    return (
      <span className="text-muted-foreground">
        {t("autoReleaseNotInternal")}
      </span>
    );
  }

  const orgSetting = org.autoRelease.enabled
    ? t("autoReleaseOrgAuto", { days: org.autoRelease.days })
    : t("autoReleaseOrgManual");
  const dirty =
    mode !== saved ||
    (mode === "auto" && Number(days) !== item.autoRelease.days);

  async function save(next: AutoReleaseMode) {
    setBusy(true);
    try {
      await requestJson(
        `${hostName}/api/orgs/${org.id}/items/${item.id}/auto-release`,
        {
          method: "PATCH",
          body: JSON.stringify(
            next === "auto"
              ? { mode: next, days: Number(days) }
              : { mode: next },
          ),
        },
      );
      await mutate(isOrgListingKey(hostName, org.id));
      toast.success(t("autoReleaseSaved"));
    } catch (err) {
      toast.error(apiErrorMessage(err, t("autoReleaseFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Select
        value={mode}
        onValueChange={(value) => {
          const next = value as AutoReleaseMode;
          setMode(next);
          //* 跟組織、手動不需要天數，選了就存；自訂天數等使用者填完按儲存
          if (next !== "auto" && next !== saved) void save(next);
        }}
        disabled={busy}
      >
        <SelectTrigger
          className="h-8 w-auto gap-2 text-sm"
          aria-label={t("autoReleaseLabel", { title: item.title })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="org">
            {t("autoReleaseFollowOrg", { setting: orgSetting })}
          </SelectItem>
          <SelectItem value="auto">{t("autoReleaseAuto")}</SelectItem>
          <SelectItem value="manual">{t("autoReleaseManual")}</SelectItem>
        </SelectContent>
      </Select>
      {mode === "auto" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void save("auto");
          }}
        >
          <Input
            type="number"
            min={1}
            max={365}
            required
            clearable={false}
            className="h-8 w-20 text-sm tabular-nums"
            aria-label={t("autoReleaseDaysLabel", { title: item.title })}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span className="text-muted-foreground">{t("autoReleaseDays")}</span>
          {dirty && (
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className={compactButton}
              disabled={busy}
            >
              {t("autoReleaseSave")}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

type Panel = "requests" | "timeline";

function ItemRow({
  org,
  item,
  open,
  onToggle,
  onReviewed,
}: {
  org: OrgAccess;
  item: ManagedOrgItem;
  open: Panel | null;
  onToggle: (panel: Panel) => void;
  onReviewed: () => void;
}) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const pending = item.pendingRequestCount;
  const cell = "px-4 py-3 align-top";
  //* 物品欄固定在左側；底色要跟著列的狀態走，捲動時才不會透出後面的欄位
  const stickyBg = open ? "bg-primary-5" : "bg-white group-hover:bg-[#fafaf9]";

  return (
    <Fragment>
      <tr
        className={cn(
          "group border-t transition-colors",
          open ? "bg-primary-5" : "hover:bg-[#fafaf9]",
        )}
      >
        <td
          className={cn(
            cell,
            "sticky left-0 z-10 min-w-[200px] max-w-[280px] sm:static",
            stickyBg,
          )}
        >
          <Link
            href={`/item/${item.id}`}
            className="font-medium leading-snug hover:underline hover:underline-offset-4"
          >
            {item.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span>{item.unit.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.createdAt} className="tabular-nums">
              {format.dateTime(new Date(item.createdAt), {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}
            </time>
            {item.assetNumber && (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono">{item.assetNumber}</span>
              </>
            )}
            {item.status !== "active" && (
              <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-dark">
                {t(`status.${item.status}`)}
              </span>
            )}
          </p>
        </td>
        <td className={cn(cell, "min-w-[290px]")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <TierPill tier={item.audienceTier} className="mr-1" />
            <TierAction org={org} item={item} />
            <PublicAction org={org} item={item} />
          </div>
        </td>
        <td className={cell}>
          <AutoReleaseControl
            key={`${item.audienceTier}:${item.autoRelease.override}:${item.autoRelease.days}`}
            org={org}
            item={item}
          />
        </td>
        <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
          <span className="font-medium">
            {item.quantity ?? <span className="text-muted-foreground">—</span>}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {item.unitWeightKg !== null
              ? t("manage.perPieceKg", { kg: item.unitWeightKg })
              : "—"}
          </span>
        </td>
        <td
          className={cn(cell, "min-w-[140px]")}
          data-testid="org-item-outcome"
        >
          {item.outcomes.length === 0 ? (
            <span className="text-muted-foreground">
              {t("manage.outcomeNone")}
            </span>
          ) : (
            <ul className="space-y-1">
              {item.outcomes.map((o) => (
                <li key={o.weaveId}>
                  {o.receiverUnit
                    ? t("manage.outcomeUnit", {
                        unit: o.receiverUnit.name,
                        quantity: o.quantity,
                      })
                    : t("manage.outcomePerson", {
                        name: o.receiver.name,
                        quantity: o.quantity,
                      })}
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className={cn(cell, "text-right")}>
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant={pending > 0 && open !== "requests" ? "default" : "ghost"}
              className={cn(
                compactButton,
                !(pending > 0 && open !== "requests") &&
                  "text-foreground hover:bg-primary-15",
                open === "requests" && "bg-primary-15",
              )}
              aria-expanded={open === "requests"}
              onClick={() => onToggle("requests")}
            >
              {open === "requests"
                ? t("manage.hideRequests")
                : t("manage.viewRequests", { count: pending })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                compactButton,
                "text-foreground hover:bg-primary-15",
                open === "timeline" && "bg-primary-15",
              )}
              aria-expanded={open === "timeline"}
              onClick={() => onToggle("timeline")}
            >
              {open === "timeline"
                ? t("manage.hideTimeline")
                : t("manage.viewTimeline")}
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-primary-5">
          <td colSpan={6} className="px-4 pb-4 pt-0">
            <div className="rounded-lg border bg-white p-4">
              {open === "requests" ? (
                <ItemRequests org={org} item={item} onReviewed={onReviewed} />
              ) : (
                <ItemTimeline orgId={org.id} itemId={item.id} />
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function TableSkeleton() {
  return (
    <div aria-hidden className="rounded-lg border">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-t px-4 py-4 first:border-t-0"
        >
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="h-6 w-20 rounded-full bg-muted" />
          <div className="ml-auto h-4 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ItemTable({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const [unitId, setUnitId] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [weaveStatus, setWeaveStatus] = useState(ALL);
  const [open, setOpen] = useState<{ itemId: string; panel: Panel } | null>(
    null,
  );

  const query = new URLSearchParams();
  if (unitId !== ALL) query.set("unitId", unitId);
  if (tier !== ALL) query.set("tier", tier);
  if (status !== ALL) query.set("status", status);
  if (weaveStatus !== ALL) query.set("weaveStatus", weaveStatus);
  const qs = query.toString();
  const filtered = qs !== "";
  const { data, error, mutate } = useSWR(
    orgItemsKey(hostName, org.id, qs),
    (url: string) => requestJson<{ items: ManagedOrgItem[] }>(url),
    { keepPreviousData: true },
  );

  function clearFilters() {
    setUnitId(ALL);
    setTier(ALL);
    setStatus(ALL);
    setWeaveStatus(ALL);
  }

  const items = data?.items ?? [];
  const pendingTotal = items.reduce((n, i) => n + i.pendingRequestCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          {org.manageableUnits.length > 1 && (
            <FilterSelect
              id="org-items-unit"
              label={t("manage.filterUnit")}
              value={unitId}
              onChange={setUnitId}
              options={org.manageableUnits.map((u) => ({
                value: String(u.id),
                label: u.name,
              }))}
            />
          )}
          <FilterSelect
            id="org-items-tier"
            label={t("manage.filterTier")}
            value={tier}
            onChange={setTier}
            options={AUDIENCE_TIERS.map((v) => ({
              value: v,
              label: t(`tier.${v}`),
            }))}
          />
          <FilterSelect
            id="org-items-status"
            label={t("manage.filterStatus")}
            value={status}
            onChange={setStatus}
            options={ORG_ITEM_STATUSES.map((v) => ({
              value: v,
              label: t(`status.${v}`),
            }))}
          />
          <FilterSelect
            id="org-items-weave-status"
            label={t("manage.filterWeaveStatus")}
            value={weaveStatus}
            onChange={setWeaveStatus}
            options={ORG_ITEM_WEAVE_STATUSES.map((v) => ({
              value: v,
              label: t(`weaveStatus.${v}`),
            }))}
          />
        </div>
        {data && (
          <p
            className="flex items-center gap-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {t("manage.count", { count: items.length })}
              {pendingTotal > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-amber-900">
                    {t("manage.pendingTotal", { count: pendingTotal })}
                  </span>
                </>
              )}
            </span>
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                {t("manage.clearFilters")}
              </button>
            )}
          </p>
        )}
      </div>

      {error && <OrgNotice tone="error">{t("loadFailed")}</OrgNotice>}
      {!data && !error && <TableSkeleton />}
      {data && items.length === 0 && (
        <OrgNotice>
          {filtered ? t("manage.empty") : t("manage.emptyAll")}
        </OrgNotice>
      )}
      {items.length > 0 && (
        <div className="relative overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 bg-white px-4 py-2.5 font-normal sm:static">
                  {t("manage.colTitle")}
                </th>
                <th className="px-4 py-2.5 font-normal">
                  {t("manage.colTier")}
                </th>
                <th className="px-4 py-2.5 font-normal">
                  {t("manage.colAutoRelease")}
                </th>
                <th className="px-4 py-2.5 text-right font-normal">
                  {t("manage.colQuantity")}
                </th>
                <th className="px-4 py-2.5 font-normal">
                  {t("manage.colOutcome")}
                </th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">{t("manage.colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  org={org}
                  item={item}
                  open={open?.itemId === item.id ? open.panel : null}
                  onToggle={(panel) =>
                    setOpen(
                      open?.itemId === item.id && open.panel === panel
                        ? null
                        : { itemId: item.id, panel },
                    )
                  }
                  onReviewed={() => void mutate()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrgItemsContent() {
  const t = useTranslations("Org");
  const { orgs, org, error, isLoading } = useSelectedOrg();
  const canManage = !!org && org.manageableUnits.length > 0;

  return (
    <OrgShell
      orgs={orgs}
      org={org}
      switchPath="/org/items"
      tabs={org ? orgTabs({ isAdmin: org.isAdmin, canManage }) : []}
      current="manage"
      title={t("manage.title")}
      subtitle={
        canManage
          ? org.isAdmin
            ? t("manage.subtitleAdmin")
            : t("manage.subtitleContact")
          : undefined
      }
      actions={
        canManage && (
          <Button asChild className="w-auto">
            <Link href={`/org/items/new?org=${org.id}`}>{t("listItem")}</Link>
          </Button>
        )
      }
    >
      {error && <OrgNotice tone="error">{t("loadFailed")}</OrgNotice>}
      {isLoading && <TableSkeleton />}
      {!isLoading && !error && orgs.length === 0 && (
        <OrgNotice>{t("noOrgs")}</OrgNotice>
      )}
      {org &&
        (canManage ? (
          <ItemTable key={org.id} org={org} />
        ) : (
          <NoUnitsNotice org={org} notContactMessage={t("manage.noUnits")} />
        ))}
    </OrgShell>
  );
}

export default function OrgItemsPage() {
  return (
    <Suspense>
      <OrgItemsContent />
    </Suspense>
  );
}
