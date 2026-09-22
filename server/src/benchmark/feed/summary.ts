// server/src/benchmark/feed/summary.ts
// Feed 對照結果的 Markdown 摘要：每個 cache 狀態與虛擬使用者數的中位數、相對變化與每請求後端工作量。

import { FEED_STRATEGY_LABEL } from "../feedStrategy";
import type { ComparisonResult, ScenarioRecord } from "./comparison";
import type { EquivalenceCheck } from "./equivalence";
import type { ScenarioSummary } from "./stats";

/** 少於此數的成功樣本時，p99 幾乎等於最大值，不應單獨解讀 */
export const MIN_SAMPLES_FOR_P99 = 100;

const format = (value: number | null, unit = "") => (value === null ? "n/a" : `${value}${unit}`);
const formatChange = (value: number | null) =>
  value === null ? "n/a" : `${value > 0 ? "+" : ""}${value}%`;
const formatRate = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(2)}%`);

function latencyRow(label: string, virtualUsers: number, summary: ScenarioSummary): string {
  const { p50, p95, p99 } = summary.medianLatencyMs;
  return `| ${virtualUsers} | ${label} | ${format(p50, " ms")} | ${format(p95, " ms")} | ${format(p99, " ms")} | ${format(summary.medianRequestRate)} | ${formatRate(summary.medianErrorRate)} | ${format(summary.medianResponseBytes)} |`;
}

function workRows(scenario: ScenarioRecord): string[] {
  return (["full-hydration", "late-materialization"] as const).map((strategy) => {
    const work = scenario.medianPerRequest[strategy];
    return `| ${scenario.virtualUsers} | ${FEED_STRATEGY_LABEL[strategy]} | ${format(work.mysqlQueries)} | ${format(work.mysqlInnodbRowsRead)} | ${format(work.mysqlBytesSent)} | ${format(work.redisVectorCommands)} | ${format(work.apiCpuMs)} |`;
  });
}

export function renderFeedSummary(
  result: ComparisonResult,
  equivalence: readonly EquivalenceCheck[],
  fixtureValidation: { passed: number; total: number },
): string {
  const lines: string[] = [
    "Synthetic benchmark on a deterministic fixture; not an observation of production traffic.",
    "Latencies are medians across repetitions of each run's nearest-rank percentile, successful requests only.",
    "",
    `Fixture validation: ${fixtureValidation.passed}/${fixtureValidation.total} checks passed.`,
    `Strategy equivalence: ${equivalence.filter((c) => c.ok).length}/${equivalence.length} fixed requests returned identical business results.`,
  ];

  const cacheStates = [...new Set(result.scenarios.map((s) => s.cacheState))];
  for (const cacheState of cacheStates) {
    const scenarios = result.scenarios.filter((s) => s.cacheState === cacheState);
    lines.push(
      "",
      `### ${cacheState === "cold" ? "Cold" : "Warm"} cache`,
      "",
      "| VUs | Strategy | p50 | p95 | p99 | req/s | Error rate | Mean bytes |",
      "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const scenario of scenarios) {
      const change = scenario.currentVsBaseline;
      lines.push(
        latencyRow("baseline", scenario.virtualUsers, scenario.baseline),
        latencyRow("current", scenario.virtualUsers, scenario.current),
        `| ${scenario.virtualUsers} | change | ${formatChange(change.p50ChangePercent)} | ${formatChange(change.p95ChangePercent)} | ${formatChange(change.p99ChangePercent)} | | | |`,
      );
    }
    lines.push(
      "",
      "Median backend work per request:",
      "",
      "| VUs | Strategy | MySQL queries | InnoDB rows read | MySQL bytes sent | Redis vector commands | API CPU ms |",
      "| ---: | --- | ---: | ---: | ---: | ---: | ---: |",
      ...scenarios.flatMap(workRows),
    );
  }

  const thinRuns = result.runs.filter((run) => (run.summary.latencyMs?.count ?? 0) < MIN_SAMPLES_FOR_P99);
  if (thinRuns.length > 0) {
    lines.push(
      "",
      `Note: ${thinRuns.length} of ${result.runs.length} runs have fewer than ${MIN_SAMPLES_FOR_P99} successful requests; their p99 is close to the maximum and should not be quoted.`,
    );
  }
  lines.push("", "Raw repetitions, per-class breakdowns, and resource observations are in the JSON artifact.");
  return lines.join("\n");
}
