"use client";

//* 組織物品管理（PRD 0001 §5.1 E3-2、E9-3）：Unit Contact 看自己負責單位的物品，
//* Org Admin 看全組織，可依單位、層級、狀態、申請篩選。範圍由 server 決定，這裡只送篩選條件。
//* 申請（#137）：所屬單位的任一窗口或 Org Admin 都能在這裡核可／婉拒，不限上架的人
import { Fragment, Suspense, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrgSwitcher } from "@/components/org/OrgSwitcher";
import {
  AUDIENCE_TIERS,
  hostName,
  ORG_ITEM_STATUSES,
  ORG_ITEM_WEAVE_STATUSES,
  OrgAccess,
  OrgItem,
  OrgItemRequest,
  requestJson,
  useSelectedOrg,
} from "@/lib/orgApi";
import { orgItemsKey } from "@/lib/orgSwrKeys";

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

function ItemTable({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const [unitId, setUnitId] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [weaveStatus, setWeaveStatus] = useState(ALL);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (unitId !== ALL) query.set("unitId", unitId);
  if (tier !== ALL) query.set("tier", tier);
  if (status !== ALL) query.set("status", status);
  if (weaveStatus !== ALL) query.set("weaveStatus", weaveStatus);
  const qs = query.toString();
  const { data, error, mutate } = useSWR(
    orgItemsKey(hostName, org.id, qs),
    (url: string) => requestJson<{ items: OrgItem[] }>(url),
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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">{t("manage.colTitle")}</th>
                <th className="p-3">{t("manage.colUnit")}</th>
                <th className="p-3">{t("manage.colTier")}</th>
                <th className="p-3">{t("manage.colStatus")}</th>
                <th className="p-3">{t("manage.colQuantity")}</th>
                <th className="p-3">{t("manage.colWeight")}</th>
                <th className="p-3">{t("manage.colAsset")}</th>
                <th className="p-3">{t("manage.colCreated")}</th>
                <th className="p-3">{t("manage.colRequests")}</th>
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
                      <Badge variant="secondary">
                        {t(`tier.${item.audienceTier}`)}
                      </Badge>
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
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant={
                          item.pendingRequestCount > 0 ? "default" : "ghost"
                        }
                        aria-expanded={openItemId === item.id}
                        onClick={() =>
                          setOpenItemId(openItemId === item.id ? null : item.id)
                        }
                      >
                        {openItemId === item.id
                          ? t("manage.hideRequests")
                          : t("manage.viewRequests", {
                              count: item.pendingRequestCount,
                            })}
                      </Button>
                    </td>
                  </tr>
                  {openItemId === item.id && (
                    <tr className="bg-muted/30">
                      <td colSpan={9} className="p-3">
                        <ItemRequests
                          org={org}
                          item={item}
                          onReviewed={() => void mutate()}
                        />
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
