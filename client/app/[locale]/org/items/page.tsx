"use client";

//* 組織物品管理（PRD 0001 §5.1 E3-2、E9-3）：Unit Contact 看自己負責單位的物品，
//* Org Admin 看全組織，可依單位、層級、狀態篩選。範圍由 server 決定，這裡只送篩選條件。
import { Suspense, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import useSWR from "swr";
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
  OrgAccess,
  OrgItem,
  requestJson,
  useSelectedOrg,
} from "@/lib/orgApi";

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

function ItemTable({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const [unitId, setUnitId] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const query = new URLSearchParams();
  if (unitId !== ALL) query.set("unitId", unitId);
  if (tier !== ALL) query.set("tier", tier);
  if (status !== ALL) query.set("status", status);
  const qs = query.toString();
  const { data, error } = useSWR(
    `${hostName}/api/orgs/${org.id}/items${qs ? `?${qs}` : ""}`,
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
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-t">
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
                </tr>
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
