"use client";

//* 組織報表（#143，PRD 0001 §5.1 E6-1、E6-2；ADR 0005）
//* 只有 Org Admin 看得到（server 不是就回 ORG_NOT_FOUND）；這版不做 CSV 匯出
//* 減碳量是「估算避免排放量」：依 docs/notes/avoided-emissions-model.md §8 揭露理想值、估算值、
//* 取代率 R 與其狀態、係數表版本、預設重量占比、不計入件數與註腳；數字都來自 server，頁面不另算
import { type ReactNode, Suspense } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { pickOrg } from "@/lib/orgAdminRules";
import { cn } from "@/lib/utils";
import { OrgNotice, OrgShell, orgTabs } from "@/components/org/OrgShell";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { hostName, OrgAccess, OrgReport, requestJson } from "@/lib/orgApi";

/** 一個數字：標籤在上、數值、灰色補充；KPI 列用 1px 分隔線切成等寬欄，不各自成卡 */
function Stat({
  label,
  value,
  hint,
  testId,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1 bg-white p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className="text-2xl font-semibold tabular-nums tracking-tight"
        data-testid={testId}
      >
        {value}
      </p>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatStrip({
  cols,
  children,
}: {
  cols: 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    //* gap-px 透出底色當分隔線：換行成 2×2 時也不用另外處理邊框
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border bg-border",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

/** 報表的一區：標題在框外，內容在下方 */
function ReportSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const th = "px-4 py-2.5 align-bottom font-normal";
const td = "px-4 py-2.5";

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
  const rate = report.circulation.rate;

  return (
    <div className="space-y-12">
      {/* E6-1 流通 */}
      <ReportSection title={t("circulationHeading")}>
        <StatStrip cols={3}>
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
            value={pct(rate)}
            hint={t("circulationRateHint")}
          >
            {rate !== null && (
              <div
                role="progressbar"
                aria-label={t("circulationRate")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(rate * 100)}
                className="h-2 overflow-hidden rounded-full bg-primary-15"
              >
                {rate > 0 && (
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(rate, 1) * 100}%` }}
                  />
                )}
              </div>
            )}
          </Stat>
        </StatStrip>

        <div className="grid gap-6 pt-3 xl:grid-cols-[2fr_3fr]">
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">{t("tiersHeading")}</h3>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className={th}>{t("colTier")}</th>
                    <th className={cn(th, "text-right")}>{t("colReached")}</th>
                    <th className={cn(th, "text-right")}>{t("colClaimed")}</th>
                    <th className={cn(th, "text-right")}>{t("colRate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tiers.map((tier) => (
                    <tr
                      key={tier.tier}
                      className="border-t"
                      data-testid={`report-tier-${tier.tier}`}
                    >
                      <td className={td}>{t(`tier.${tier.tier}`)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(tier.reachedItemCount)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(tier.quantity)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {pct(tier.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("tiersHint")}</p>
          </div>

          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">{t("unitsHeading")}</h3>
            {report.units.length === 0 ? (
              <OrgNotice>{t("unitsEmpty")}</OrgNotice>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className={th}>{t("colUnit")}</th>
                      <th className={cn(th, "text-right")}>{t("colListed")}</th>
                      <th className={cn(th, "text-right")}>{t("colGiven")}</th>
                      <th className={cn(th, "text-right")}>
                        {t("colReceived")}
                      </th>
                      <th className={cn(th, "text-right")}>
                        {t("colUnitEstimatedShort")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.units.map((u) => (
                      <tr key={u.unit.id} className="border-t">
                        <td className={cn(td, "font-medium")}>{u.unit.name}</td>
                        <td className={cn(td, "text-right tabular-nums")}>
                          {num(u.listedQuantity)}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>
                          {num(u.givenQuantity)}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>
                          {num(u.receivedQuantity)}
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>
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
        </div>
      </ReportSection>

      {/* E6-2 重量、價值、避免排放量 */}
      <ReportSection title={t("emissionsHeading")} hint={t("emissionsScope")}>
        <StatStrip cols={4}>
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
        </StatStrip>

        {/* 待實現：預估值，跟上方已實現的數字分開，不相加 */}
        <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{t("unrealizedLabel")}</p>
            <p className="text-xs text-muted-foreground">
              {e.unrealized.quantity === 0
                ? t("unrealizedNone")
                : t("unrealizedHint", { count: e.unrealized.quantity })}
              {e.unrealized.uncountedQuantity > 0 &&
                ` ${t("unrealizedUncounted", { count: e.unrealized.uncountedQuantity })}`}
            </p>
          </div>
          <p
            className="shrink-0 text-lg font-semibold tabular-nums text-muted-foreground"
            data-testid="report-unrealized"
          >
            {t("unrealizedValue", {
              value: num(e.unrealized.estimatedKgCO2e, 1),
            })}
          </p>
        </div>

        <div className="grid gap-6 pt-3 lg:grid-cols-2">
          <dl className="min-w-0 divide-y rounded-lg border bg-white text-sm">
            <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">{t("replacementRate")}</dt>
              <dd data-testid="report-replacement-rate" className="text-right">
                {t("replacementRateValue", {
                  rate: num(e.replacementRate.value, 2),
                  status: rateStatus,
                })}{" "}
                <a
                  href={e.replacementRate.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {t("replacementRateSource")}
                </a>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">
                {t("factorTableVersion")}
              </dt>
              <dd data-testid="report-factor-version" className="tabular-nums">
                {e.factorTableVersion}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">
                {t("defaultWeightShareLabel")}
              </dt>
              <dd data-testid="report-default-share" className="tabular-nums">
                {pct(e.defaultWeightShare)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-muted-foreground">{t("uncounted")}</dt>
              <dd data-testid="report-uncounted" className="tabular-nums">
                {t("pieces", { count: e.uncountedQuantity })}
              </dd>
            </div>
          </dl>

          <div className="space-y-1.5 rounded-lg bg-primary-5 p-4 text-sm">
            <p className="font-semibold">{t("formulaHeading")}</p>
            <p>{t("formulaPotential")}</p>
            <p>{t("formulaEstimated")}</p>
            <p>{t("formulaUnrealized")}</p>
            <p className="pt-1 text-xs text-muted-foreground">
              {t("formulaFactor")}
            </p>
          </div>
        </div>

        {e.byCategory.length > 0 && (
          <div className="space-y-2 pt-3">
            <h3 className="text-sm font-semibold">{t("byCategoryHeading")}</h3>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className={th}>{t("colCategory")}</th>
                    <th className={cn(th, "text-right")}>{t("colQuantity")}</th>
                    <th className={cn(th, "text-right")}>{t("colWeight")}</th>
                    <th className={cn(th, "text-right")}>
                      {t("colPotential")}
                    </th>
                    <th className={cn(th, "text-right")}>
                      {t("colEstimated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.byCategory.map((c) => (
                    <tr key={c.categoryId} className="border-t">
                      <td className={td}>{c.name}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.quantity)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.weightKg, 1)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.potentialKgCO2e, 1)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.estimatedKgCO2e, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ReportSection>

      {/* 係數與來源：參考資料，預設收合 */}
      <details className="group rounded-lg border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-lg font-semibold">
              {t("factorsHeading")}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t("factorsSummary", { count: report.factors.length })}
            </span>
          </span>
          <span
            aria-hidden
            className="text-muted-foreground transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className={th}>{t("colCategory")}</th>
                <th className={cn(th, "text-right")}>{t("colFactor")}</th>
                <th className={th}>{t("colMethod")}</th>
                <th className={th}>{t("colSources")}</th>
              </tr>
            </thead>
            <tbody>
              {report.factors.map((f) => (
                <tr key={f.categoryId} className="border-t align-top">
                  <td className={cn(td, "font-medium")}>{f.name}</td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {f.kgCO2ePerKg === null ? (
                      <span className="text-muted-foreground">
                        {t("notCounted")}
                      </span>
                    ) : (
                      num(f.kgCO2ePerKg, 2)
                    )}
                  </td>
                  <td className={td}>
                    {t(`method.${f.method}`)}
                    {f.basis && (
                      <span className="block text-xs text-muted-foreground">
                        {t(`basis.${f.basis}`)}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    <ul className="space-y-1">
                      {f.sources.map((s) => (
                        <li key={s.url + s.title}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-primary"
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
      </details>

      <p
        className="max-w-4xl text-xs leading-relaxed text-muted-foreground"
        data-testid="report-footnote"
      >
        {t("footnote", { version: e.factorTableVersion })}
      </p>
    </div>
  );
}

function OrgReportContent() {
  const t = useTranslations("OrgReport");
  const apiErrorMessage = useApiErrorMessage();
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
    <OrgShell
      orgs={adminOrgs}
      org={org}
      switchPath="/org-admin/report"
      tabs={orgTabs({ isAdmin: true, canManage: true })}
      current="report"
      title={t("title")}
      subtitle={t("subtitle")}
    >
      {loadError && (
        <OrgNotice tone="error">
          {apiErrorMessage(loadError, t("loadFailed"))}
        </OrgNotice>
      )}
      {orgList && adminOrgs.length === 0 && (
        <OrgNotice>{t("noOrgs")}</OrgNotice>
      )}
      {org && !data && !error && <OrgNotice>{t("loading")}</OrgNotice>}
      {data && <ReportView report={data.report} />}
    </OrgShell>
  );
}

export default function OrgReportPage() {
  return (
    <Suspense>
      <OrgReportContent />
    </Suspense>
  );
}
