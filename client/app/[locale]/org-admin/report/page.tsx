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

/** 一個數字：標籤在上、數值、補充說明 */
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
    <div className="min-w-0 space-y-1.5 bg-white p-5 md:p-6">
      <p className="text-sm font-medium text-dark/70">{label}</p>
      <p
        className="text-3xl font-bold tabular-nums tracking-tight text-megaweave-forest-dark"
        data-testid={testId}
      >
        {value}
      </p>
      {children}
      {hint && <p className="text-sm text-dark/60">{hint}</p>}
    </div>
  );
}

/** 排放量區塊裡已實現的數字：淺底與白色區塊分層 */
function FieldStat({
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
    <div className="min-w-0 space-y-1.5 rounded-2xl bg-primary-5 p-5">
      <p className="text-sm font-medium text-dark/70">{label}</p>
      <p
        className="text-2xl font-bold tabular-nums tracking-tight text-megaweave-forest-dark md:text-3xl"
        data-testid={testId}
      >
        {value}
      </p>
      {hint && <p className="text-sm text-dark/60">{hint}</p>}
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
        "grid gap-px overflow-hidden rounded-2xl bg-primary-15",
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
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-megaweave-forest-dark">
          {title}
        </h2>
        {hint && <p className="text-base text-dark/70">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-lg font-bold text-megaweave-forest-dark">{children}</h3>
  );
}

const th = "px-4 py-3 align-bottom font-medium";
const td = "px-4 py-3";
const tableBox = "overflow-x-auto rounded-2xl bg-white";
const thead = "text-left text-sm text-dark/60";
const row = "border-t border-primary-15";

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
    <div className="space-y-14">
      {/* E6-2 避免排放量：報表的主角，放最上面。待實現（預估）最大；已實現的數字並列在下，兩者不相加 */}
      <section
        aria-labelledby="report-emissions-heading"
        className="space-y-8 rounded-3xl bg-white p-6 md:p-10"
      >
        <div className="space-y-1">
          <h2
            id="report-emissions-heading"
            className="text-2xl font-bold tracking-tight text-megaweave-forest-dark"
          >
            {t("emissionsHeading")}
          </h2>
        </div>

        <div className="space-y-3">
          <p className="text-lg font-semibold text-dark/80">
            {t("unrealizedLabel")}
          </p>
          <p
            className="text-6xl font-bold tabular-nums leading-none tracking-tight text-megaweave-forest md:text-8xl"
            data-testid="report-unrealized"
          >
            {t("unrealizedValue", {
              value: num(e.unrealized.estimatedKgCO2e, 1),
            })}
          </p>
          <p className="max-w-3xl text-base leading-relaxed text-dark/70">
            {e.unrealized.quantity === 0
              ? t("unrealizedNone")
              : t("unrealizedHint", { count: e.unrealized.quantity })}
            {e.unrealized.uncountedQuantity > 0 &&
              ` ${t("unrealizedUncounted", { count: e.unrealized.uncountedQuantity })}`}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-base text-dark/70">{t("emissionsScope")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FieldStat
              label={t("estimatedKg")}
              value={t("kgCO2e", { value: num(e.estimatedKgCO2e, 1) })}
              hint={t("estimatedKgHint", {
                rate: num(e.replacementRate.value, 2),
              })}
              testId="report-estimated"
            />
            <FieldStat
              label={t("potentialKg")}
              value={t("kgCO2e", { value: num(e.potentialKgCO2e, 1) })}
              hint={t("potentialKgHint")}
              testId="report-potential"
            />
            <FieldStat
              label={t("totalWeight")}
              value={t("kg", { value: num(e.totalWeightKg, 1) })}
              hint={t("defaultWeightShare", {
                share: pct(e.defaultWeightShare),
              })}
              testId="report-weight"
            />
            <FieldStat
              label={t("estimatedValue")}
              value={t("twd", { value: num(value.estimatedValueTwd) })}
              hint={t("unvalued", { count: value.unvaluedQuantity })}
              testId="report-value"
            />
          </div>
        </div>
      </section>

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

        <div className="grid gap-6 pt-4 xl:grid-cols-[2fr_3fr]">
          <div className="min-w-0 space-y-3">
            <SubHeading>{t("tiersHeading")}</SubHeading>
            <div className={tableBox}>
              <table className="w-full min-w-[420px] text-[15px]">
                <thead className={thead}>
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
                      className={row}
                      data-testid={`report-tier-${tier.tier}`}
                    >
                      <td className={td}>{t(`tier.${tier.tier}`)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(tier.reachedItemCount)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(tier.quantity)}
                      </td>
                      <td
                        className={cn(
                          td,
                          "text-right font-bold tabular-nums text-megaweave-forest-dark",
                        )}
                      >
                        {pct(tier.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-relaxed text-dark/60">
              {t("tiersHint")}
            </p>
          </div>

          <div className="min-w-0 space-y-3">
            <SubHeading>{t("unitsHeading")}</SubHeading>
            {report.units.length === 0 ? (
              <OrgNotice>{t("unitsEmpty")}</OrgNotice>
            ) : (
              <div className={tableBox}>
                <table className="w-full min-w-[520px] text-[15px]">
                  <thead className={thead}>
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
                      <tr key={u.unit.id} className={row}>
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
                        <td
                          className={cn(
                            td,
                            "text-right font-bold tabular-nums text-megaweave-forest-dark",
                          )}
                        >
                          {num(u.givenEstimatedKgCO2e, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm leading-relaxed text-dark/60">
              {t("unitsHint")}
            </p>
          </div>
        </div>
      </ReportSection>

      {/* 計算方法與揭露項目、各類別 */}
      <ReportSection title={t("formulaHeading")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-2xl bg-white p-5 text-base md:p-6">
            <p>{t("formulaPotential")}</p>
            <p>{t("formulaEstimated")}</p>
            <p className="font-semibold text-megaweave-forest-dark">
              {t("formulaUnrealized")}
            </p>
            <p className="pt-1 text-sm leading-relaxed text-dark/60">
              {t("formulaFactor")}
            </p>
          </div>

          <dl className="min-w-0 divide-y divide-primary-15 rounded-2xl bg-white text-base">
            <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
              <dt className="text-dark/60">{t("replacementRate")}</dt>
              <dd data-testid="report-replacement-rate" className="text-right">
                {t("replacementRateValue", {
                  rate: num(e.replacementRate.value, 2),
                  status: rateStatus,
                })}{" "}
                <a
                  href={e.replacementRate.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-megaweave-forest underline underline-offset-4 hover:text-megaweave-forest-dark"
                >
                  {t("replacementRateSource")}
                </a>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
              <dt className="text-dark/60">{t("factorTableVersion")}</dt>
              <dd data-testid="report-factor-version" className="tabular-nums">
                {e.factorTableVersion}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
              <dt className="text-dark/60">{t("defaultWeightShareLabel")}</dt>
              <dd data-testid="report-default-share" className="tabular-nums">
                {pct(e.defaultWeightShare)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
              <dt className="text-dark/60">{t("uncounted")}</dt>
              <dd data-testid="report-uncounted" className="tabular-nums">
                {t("pieces", { count: e.uncountedQuantity })}
              </dd>
            </div>
          </dl>
        </div>

        {e.byCategory.length > 0 && (
          <div className="space-y-3 pt-4">
            <SubHeading>{t("byCategoryHeading")}</SubHeading>
            <div className={tableBox}>
              <table className="w-full min-w-[560px] text-[15px]">
                <thead className={thead}>
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
                    <tr key={c.categoryId} className={row}>
                      <td className={cn(td, "font-medium")}>{c.name}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.quantity)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.weightKg, 1)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {num(c.potentialKgCO2e, 1)}
                      </td>
                      <td
                        className={cn(
                          td,
                          "text-right font-bold tabular-nums text-megaweave-forest-dark",
                        )}
                      >
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
      <details className="group rounded-2xl bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 md:px-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-xl font-bold tracking-tight text-megaweave-forest-dark">
              {t("factorsHeading")}
            </span>
            <span className="block text-base text-dark/60">
              {t("factorsSummary", { count: report.factors.length })}
            </span>
          </span>
          <span
            aria-hidden
            className="text-xl text-megaweave-forest transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-primary-15">
          <table className="w-full min-w-[640px] text-[15px]">
            <thead className={thead}>
              <tr>
                <th className={th}>{t("colCategory")}</th>
                <th className={cn(th, "text-right")}>{t("colFactor")}</th>
                <th className={th}>{t("colMethod")}</th>
                <th className={th}>{t("colSources")}</th>
              </tr>
            </thead>
            <tbody>
              {report.factors.map((f) => (
                <tr key={f.categoryId} className={cn(row, "align-top")}>
                  <td className={cn(td, "font-medium")}>{f.name}</td>
                  <td className={cn(td, "text-right tabular-nums")}>
                    {f.kgCO2ePerKg === null ? (
                      <span className="text-dark/60">{t("notCounted")}</span>
                    ) : (
                      num(f.kgCO2ePerKg, 2)
                    )}
                  </td>
                  <td className={td}>
                    {t(`method.${f.method}`)}
                    {f.basis && (
                      <span className="block text-sm text-dark/60">
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
                            className="text-megaweave-forest underline underline-offset-4 hover:text-megaweave-forest-dark"
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
        className="max-w-4xl text-sm leading-relaxed text-dark/60"
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
