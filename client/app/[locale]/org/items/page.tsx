"use client";

//* 組織物品管理（PRD 0001 §5.1 E3-2、E9-3）：Unit Contact 看自己負責單位的物品，
//* Org Admin 看全組織，可依單位、層級、狀態、申請篩選。範圍由 server 決定，這裡只送篩選條件。
//* 申請（#137）：所屬單位的任一窗口或 Org Admin 都能在這裡核可／婉拒，不限上架的人
//* 層級（#138）：窗口可把自己單位的物品從 Internal 升到 Members；Org Admin 另可降回 Internal。
//* 降級會自動婉拒看不到新層級的人的申請，有已核可的申請時 server 回 ORG_TIER_DEMOTION_BLOCKED
//* 自動升級（#139）：Internal 物品可覆寫組織設定（跟組織、自訂天數、手動）；其他層級不會自動升級，不顯示
//* 公開（#140）：Org Admin 送出 10 分鐘待公開（有財產編號要確認處分）、可取消；演示組織可跳過；可從 Public 降回
//* 去向與時間軸（#141，E9-1、E9-3）：每件物品交給了哪個單位或個人；展開看從上架到交接完成的每一步
import { Fragment, Suspense, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR, { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrgSwitcher } from "@/components/org/OrgSwitcher";
import { ItemTimeline } from "@/components/org/ItemTimeline";
import { PublicAction } from "@/components/org/PublicAction";
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
    <div className="min-w-36 space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
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
    <ul className="space-y-2">
      {data.requests.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {r.receiverUnit
                ? t("manage.requestOnBehalf", {
                    name: r.receiver.name,
                    unit: r.receiverUnit.name,
                  })
                : t("manage.requestPersonal", { name: r.receiver.name })}
            </span>
            <span className="text-muted-foreground">
              {t("manage.requestQuantity", { quantity: r.quantity })}
            </span>
            <span className="text-muted-foreground">
              {format.dateTime(new Date(r.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
            <Badge variant="outline">{t(`weaveStatus.${r.status}`)}</Badge>
          </div>
          {r.status === "requested" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busyId !== null}
                onClick={() => review(r.id, "approved")}
              >
                {t("manage.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId !== null}
                onClick={() => review(r.id, "declined")}
              >
                {t("manage.decline")}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
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
    <Button size="sm" variant="outline" disabled={busy} onClick={change}>
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
    return <span>{t("autoReleaseNotInternal")}</span>;
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
    <div className="flex flex-wrap items-center gap-2">
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
          className="h-8 w-44"
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
          className="flex items-center gap-1"
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
            className="h-8 w-20"
            aria-label={t("autoReleaseDaysLabel", { title: item.title })}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span className="text-muted-foreground">{t("autoReleaseDays")}</span>
          {dirty && (
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              {t("autoReleaseSave")}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

function ItemTable({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const [unitId, setUnitId] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [weaveStatus, setWeaveStatus] = useState(ALL);
  const [open, setOpen] = useState<{
    itemId: string;
    panel: "requests" | "timeline";
  } | null>(null);
  const isOpen = (itemId: string, panel: "requests" | "timeline") =>
    open?.itemId === itemId && open.panel === panel;
  const toggle = (itemId: string, panel: "requests" | "timeline") =>
    setOpen(isOpen(itemId, panel) ? null : { itemId, panel });

  const query = new URLSearchParams();
  if (unitId !== ALL) query.set("unitId", unitId);
  if (tier !== ALL) query.set("tier", tier);
  if (status !== ALL) query.set("status", status);
  if (weaveStatus !== ALL) query.set("weaveStatus", weaveStatus);
  const qs = query.toString();
  const { data, error, mutate } = useSWR(
    orgItemsKey(hostName, org.id, qs),
    (url: string) => requestJson<{ items: ManagedOrgItem[] }>(url),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
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

      {error && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {!data && !error && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("manage.empty")}</p>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">{t("manage.colTitle")}</th>
                <th className="p-3">{t("manage.colUnit")}</th>
                <th className="p-3">{t("manage.colTier")}</th>
                <th className="p-3">{t("manage.colAutoRelease")}</th>
                <th className="p-3">{t("manage.colStatus")}</th>
                <th className="p-3">{t("manage.colQuantity")}</th>
                <th className="p-3">{t("manage.colWeight")}</th>
                <th className="p-3">{t("manage.colAsset")}</th>
                <th className="p-3">{t("manage.colCreated")}</th>
                <th className="p-3">{t("manage.colOutcome")}</th>
                <th className="p-3">{t("manage.colRequests")}</th>
                <th className="p-3">
                  <span className="sr-only">{t("timeline.title")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <Fragment key={item.id}>
                  <tr className="border-t">
                    <td className="p-3">
                      <Link href={`/item/${item.id}`} className="underline">
                        {item.title}
                      </Link>
                    </td>
                    <td className="p-3">{item.unit.name}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {t(`tier.${item.audienceTier}`)}
                        </Badge>
                        <TierAction org={org} item={item} />
                        <PublicAction org={org} item={item} />
                      </div>
                    </td>
                    <td className="p-3">
                      <AutoReleaseControl
                        key={`${item.audienceTier}:${item.autoRelease.override}:${item.autoRelease.days}`}
                        org={org}
                        item={item}
                      />
                    </td>
                    <td className="p-3">{t(`status.${item.status}`)}</td>
                    <td className="p-3">{item.quantity ?? "—"}</td>
                    <td className="p-3">
                      {item.unitWeightKg !== null
                        ? t("manage.weightKg", { kg: item.unitWeightKg })
                        : "—"}
                    </td>
                    <td className="p-3">{item.assetNumber ?? "—"}</td>
                    <td className="p-3">
                      {format.dateTime(new Date(item.createdAt), {
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="p-3" data-testid="org-item-outcome">
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
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant={
                          item.pendingRequestCount > 0 ? "default" : "ghost"
                        }
                        aria-expanded={isOpen(item.id, "requests")}
                        onClick={() => toggle(item.id, "requests")}
                      >
                        {isOpen(item.id, "requests")
                          ? t("manage.hideRequests")
                          : t("manage.viewRequests", {
                              count: item.pendingRequestCount,
                            })}
                      </Button>
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={isOpen(item.id, "timeline")}
                        onClick={() => toggle(item.id, "timeline")}
                      >
                        {isOpen(item.id, "timeline")
                          ? t("manage.hideTimeline")
                          : t("manage.viewTimeline")}
                      </Button>
                    </td>
                  </tr>
                  {open?.itemId === item.id && (
                    <tr className="bg-muted/30">
                      <td colSpan={12} className="p-3">
                        {open.panel === "requests" ? (
                          <ItemRequests
                            org={org}
                            item={item}
                            onReviewed={() => void mutate()}
                          />
                        ) : (
                          <ItemTimeline orgId={org.id} itemId={item.id} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        href={org ? `/org?org=${org.id}` : "/org"}
        className="text-sm underline"
      >
        {t("backToOrg")}
      </Link>
      <h1 className="text-2xl font-bold">{t("manage.title")}</h1>
      {error && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {!isLoading && !error && orgs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrgs")}</p>
      )}
      {org && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <OrgSwitcher orgs={orgs} org={org} basePath="/org/items" />
            {org.manageableUnits.length > 0 && (
              <Button asChild>
                <Link href={`/org/items/new?org=${org.id}`}>
                  {t("listItem")}
                </Link>
              </Button>
            )}
          </div>
          {org.manageableUnits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("manage.noUnits")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {org.isAdmin
                  ? t("manage.subtitleAdmin")
                  : t("manage.subtitleContact")}
              </p>
              <ItemTable key={org.id} org={org} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function OrgItemsPage() {
  return (
    <Suspense>
      <OrgItemsContent />
    </Suspense>
  );
}
