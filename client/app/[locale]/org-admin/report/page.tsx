"use client";

//* 組織報表（#143，PRD 0001 §5.1 E6-1、E6-2；ADR 0005）
//* 只有 Org Admin 看得到（server 不是就回 ORG_NOT_FOUND）；這版不做 CSV 匯出
//* 減碳量是「估算避免排放量」：依 docs/notes/avoided-emissions-model.md §8 揭露潛在值、估算值、
//* 取代率 R 與其狀態、係數表版本、預設重量占比、不計入件數與註腳；數字都來自 server，頁面不另算
import { Suspense } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { pickOrg } from "@/lib/orgAdminRules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { hostName, OrgAccess, OrgReport, requestJson } from "@/lib/orgApi";

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        data-testid={testId}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReportView({ report }: { report: OrgReport }) {
  const t = useTranslations("OrgReport");
  const format = useFormatter();
  const num = (n: number, digits = 0) =>
    format.number(n, { maximumFractionDigits: digits });
  const pct = (rate: number | null) =>
    rate === null
      ? "—"
      : format.number(rate, { style: "percent", maximumFractionDigits: 1 });
  const { emissions: e, value } = report;
  const rateStatus = t(`rateStatus.${e.replacementRate.status}`);

  return (
    <>
      {/* E6-1 流通 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("circulationHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("listed")}
              value={t("pieces", { count: report.listing.quantity })}
              hint={t("listedItems", { count: report.listing.itemCount })}
              testId="report-listed"
            />
            <Stat
              label={t("circulated")}
              value={t("pieces", { count: report.circulation.quantity })}
              hint={t("circulatedWeaves", {
                count: report.circulation.weaveCount,
              })}
              testId="report-circulated"
            />
            <Stat
              label={t("circulationRate")}
              value={pct(report.circulation.rate)}
              hint={t("circulationRateHint")}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("tiersHeading")}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 font-normal">{t("colTier")}</th>
                    <th className="py-2 text-right font-normal">
                      {t("colReached")}
                    </th>
                    <th className="py-2 text-right font-normal">
                      {t("colClaimed")}
                    </th>
                    <th className="py-2 text-right font-normal">
                      {t("colRate")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.tiers.map((tier) => (
                    <tr
                      key={tier.tier}
                      className="border-t"
                      data-testid={`report-tier-${tier.tier}`}
                    >
                      <td className="py-2">{t(`tier.${tier.tier}`)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {num(tier.reachedItemCount)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {num(tier.quantity)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {pct(tier.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("tiersHint")}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("unitsHeading")}</h3>
            {report.units.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("unitsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 font-normal">{t("colUnit")}</th>
                      <th className="py-2 text-right font-normal">
                        {t("colListed")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colGiven")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colReceived")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colUnitEstimated")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.units.map((u) => (
                      <tr key={u.unit.id} className="border-t">
                        <td className="py-2">{u.unit.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {num(u.listedQuantity)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(u.givenQuantity)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(u.receivedQuantity)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(u.givenEstimatedKgCO2e, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("unitsHint")}</p>
          </div>
        </CardContent>
      </Card>

      {/* E6-2 重量、價值、避免排放量 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("emissionsHeading")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("emissionsScope")}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label={t("estimatedKg")}
              value={t("kgCO2e", { value: num(e.estimatedKgCO2e, 1) })}
              hint={t("estimatedKgHint", {
                rate: num(e.replacementRate.value, 2),
              })}
              testId="report-estimated"
            />
            <Stat
              label={t("potentialKg")}
              value={t("kgCO2e", { value: num(e.potentialKgCO2e, 1) })}
              hint={t("potentialKgHint")}
              testId="report-potential"
            />
            <Stat
              label={t("totalWeight")}
              value={t("kg", { value: num(e.totalWeightKg, 1) })}
              hint={t("defaultWeightShare", {
                share: pct(e.defaultWeightShare),
              })}
              testId="report-weight"
            />
            <Stat
              label={t("estimatedValue")}
              value={t("twd", { value: num(value.estimatedValueTwd) })}
              hint={t("unvalued", { count: value.unvaluedQuantity })}
              testId="report-value"
            />
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("replacementRate")}</dt>
              <dd data-testid="report-replacement-rate">
                {t("replacementRateValue", {
                  rate: num(e.replacementRate.value, 2),
                  status: rateStatus,
                })}{" "}
                <a
                  href={e.replacementRate.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("replacementRateSource")}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("factorTableVersion")}
              </dt>
              <dd data-testid="report-factor-version">
                {e.factorTableVersion}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("defaultWeightShareLabel")}
              </dt>
              <dd data-testid="report-default-share">
                {pct(e.defaultWeightShare)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("uncounted")}</dt>
              <dd data-testid="report-uncounted">
                {t("pieces", { count: e.uncountedQuantity })}
              </dd>
            </div>
          </dl>

          <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium">{t("formulaHeading")}</p>
            <p>{t("formulaPotential")}</p>
            <p>{t("formulaEstimated")}</p>
            <p className="text-xs text-muted-foreground">
              {t("formulaFactor")}
            </p>
          </div>

          {e.byCategory.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("byCategoryHeading")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 font-normal">{t("colCategory")}</th>
                      <th className="py-2 text-right font-normal">
                        {t("colQuantity")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colWeight")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colPotential")}
                      </th>
                      <th className="py-2 text-right font-normal">
                        {t("colEstimated")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.byCategory.map((c) => (
                      <tr key={c.categoryId} className="border-t">
                        <td className="py-2">{c.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {num(c.quantity)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(c.weightKg, 1)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(c.potentialKgCO2e, 1)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {num(c.estimatedKgCO2e, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 係數與來源 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("factorsHeading")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">{t("colCategory")}</th>
                  <th className="py-2 text-right font-normal">
                    {t("colFactor")}
                  </th>
                  <th className="py-2 pl-4 font-normal">{t("colMethod")}</th>
                  <th className="py-2 font-normal">{t("colSources")}</th>
                </tr>
              </thead>
              <tbody>
                {report.factors.map((f) => (
                  <tr key={f.categoryId} className="border-t align-top">
                    <td className="py-2">{f.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {f.kgCO2ePerKg === null
                        ? t("notCounted")
                        : num(f.kgCO2ePerKg, 2)}
                    </td>
                    <td className="py-2 pl-4">
                      {t(`method.${f.method}`)}
                      {f.basis && (
                        <span className="block text-xs text-muted-foreground">
                          {t(`basis.${f.basis}`)}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <ul className="space-y-1">
                        {f.sources.map((s) => (
                          <li key={s.url + s.title}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {s.publisher}（{s.year}）
                            </a>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p
        className="text-xs leading-relaxed text-muted-foreground"
        data-testid="report-footnote"
      >
        {t("footnote", { version: e.factorTableVersion })}
      </p>
    </>
  );
}

function OrgReportContent() {
  const t = useTranslations("OrgReport");
  const apiErrorMessage = useApiErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: orgList, error: orgError } = useSWR(
    `${hostName}/api/orgs`,
    (url: string) => requestJson<{ orgs: OrgAccess[] }>(url),
  );
  const adminOrgs = (orgList?.orgs ?? []).filter((o) => o.isAdmin);
  const wanted = searchParams.get("org");
  const org = pickOrg(adminOrgs, wanted);

  const { data, error } = useSWR(
    org ? `${hostName}/api/org-admin/orgs/${org.id}/report` : null,
    (url: string) => requestJson<{ report: OrgReport }>(url),
  );
  const loadError = orgError ?? error;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {org && <p className="text-lg font-semibold">{org.name}</p>}
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        {org && (
          <Link
            href={`/org-admin?org=${org.id}`}
            className="inline-block text-sm underline"
          >
            {t("backToAdmin")}
          </Link>
        )}
      </header>

      {adminOrgs.length > 1 && org && (
        <div className="space-y-2">
          <Label htmlFor="org-report-org">{t("orgLabel")}</Label>
          <Select
            value={org.id}
            onValueChange={(id) =>
              router.replace(`/org-admin/report?org=${id}`)
            }
          >
            <SelectTrigger id="org-report-org" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {adminOrgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loadError && (
        <p className="text-sm text-destructive">
          {apiErrorMessage(loadError, t("loadFailed"))}
        </p>
      )}
      {orgList && adminOrgs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrgs")}</p>
      )}
      {org && !data && !error && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {data && <ReportView report={data.report} />}
    </main>
  );
}

export default function OrgReportPage() {
  return (
    <Suspense>
      <OrgReportContent />
    </Suspense>
  );
}
