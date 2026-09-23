// server/src/benchmark/queue/summary.ts
// Queue burst 的 Markdown 摘要：非同步處理能力、backlog、使用者端延遲變化與持久化一致性。

import type { LatencySummary } from "../feed/stats";
import { MIN_SAMPLES_FOR_P99 } from "../feed/summary";
import type { JobAccounting, QueueAccount } from "./accounting";
import type { BacklogSummary } from "./backlog";
import type { ConsistencyResult } from "./consistency";
import type { PhaseSummary, TrafficGroup } from "./phases";

export interface QueueBurstSummaryInput {
  units: number;
  stagedImagesByVariant: Record<string, number>;
  accounting: JobAccounting;
  backlog: BacklogSummary;
  timeToZeroBacklogMs: number | null;
  phases: readonly PhaseSummary[];
  consistency: ConsistencyResult;
  queueConcurrency: Record<string, number>;
  workerConnections: Record<string, number>;
}

const format = (value: number | null | undefined, unit = "") => (value === null || value === undefined ? "n/a" : `${value}${unit}`);
const formatChange = (value: number | null) => (value === null ? "n/a" : `${value > 0 ? "+" : ""}${value}%`);
const formatRate = (value: number) => `${(value * 100).toFixed(2)}%`;
const seconds = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
const distribution = (summary: LatencySummary | null) =>
  summary ? `${summary.p50} / ${summary.p95} / ${summary.max} ms` : "n/a";

function queueRow(name: string, account: QueueAccount, concurrency: number | undefined, workers: number | undefined): string {
  const cells = [
    name,
    `${account.submitted}`,
    `${account.completed}`,
    `${account.terminalFailed}`,
    `${account.unfinished + account.unobserved}`,
    `${account.retries} (${account.retriedJobs} jobs)`,
    distribution(account.queueWaitMs),
    distribution(account.processingMs),
    format(account.completedPerHour),
    concurrency === undefined || workers === undefined ? "n/a" : `${concurrency} × ${workers}`,
  ];
  return `| ${cells.join(" | ")} |`;
}

const GROUP_LABEL: Record<TrafficGroup, string> = { feed: "Feed", "post-creation": "Post creation" };

export function renderQueueBurstSummary(input: QueueBurstSummaryInput): string {
  const burst = input.accounting.byOrigin.burst;
  const traffic = input.accounting.byOrigin.traffic.total;
  const lines: string[] = [
    "Synthetic benchmark on a deterministic fixture with mocked OpenAI and S3; not an observation of production traffic.",
    "Queue timings come from the BullMQ event stream (Redis clock). Latency percentiles are nearest-rank over successful requests.",
    "",
    `Burst: ${input.units} post/interaction units, ${burst.total.submitted} jobs. ` +
      `Time to zero backlog after the last enqueue: ${seconds(input.timeToZeroBacklogMs)}. ` +
      `Peak depth: ${input.backlog.peak.depth} jobs at ${seconds(input.backlog.peak.atOffsetMs)} after injection started.`,
    "",
    `Staged burst images by source: ${Object.entries(input.stagedImagesByVariant).map(([name, count]) => `${name} ${count}`).join(", ")}.`,
    "",
    "### Burst jobs",
    "",
    "| Queue | Submitted | Completed | Terminal failures | Unfinished | Retries | Queue wait p50 / p95 / max | Processing p50 / p95 / max | Completed/hour | Concurrency × workers |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(burst.byQueue).map(([queue, account]) =>
      queueRow(queue, account, input.queueConcurrency[queue], input.workerConnections[queue]),
    ),
    queueRow("all", burst.total, undefined, undefined),
    "",
    `Jobs enqueued by the API during the run: ${traffic.submitted} (${traffic.completed} completed, ${traffic.terminalFailed} terminal failures).`,
    "",
    "### User-facing traffic",
    "",
    "| Phase | Traffic | Requests | Error rate | p50 | p95 | p99 | p95 vs before |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const phase of input.phases) {
    for (const group of Object.keys(GROUP_LABEL) as TrafficGroup[]) {
      const summary = phase.groups[group];
      lines.push(
        `| ${phase.name} (${seconds(phase.durationMs)}) | ${GROUP_LABEL[group]} | ${summary.requests} | ${formatRate(summary.errorRate)} | ` +
          `${format(summary.latencyMs?.p50, " ms")} | ${format(summary.latencyMs?.p95, " ms")} | ${format(summary.latencyMs?.p99, " ms")} | ` +
          `${formatChange(phase.p95ChangeVsBeforePercent[group])} |`,
      );
    }
  }

  const thin = input.phases.flatMap((phase) =>
    (Object.keys(GROUP_LABEL) as TrafficGroup[])
      .filter((group) => (phase.groups[group].latencyMs?.count ?? 0) < MIN_SAMPLES_FOR_P99)
      .map((group) => `${GROUP_LABEL[group].toLowerCase()} in ${phase.name}`),
  );
  lines.push(
    "",
    "Post-creation latency covers the presigned-URL and create-post API calls.",
    ...(thin.length
      ? [
          `Note: fewer than ${MIN_SAMPLES_FOR_P99} successful requests for ${thin.join(", ")}; ` +
            "their p95/p99 are close to the maximum and indicate direction only, not a quotable percentile.",
        ]
      : []),
    "",
    "### Durable consistency",
    "",
    ...input.consistency.checks.map(
      (check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.actual}/${check.expected}${check.missing.length ? ` (e.g. ${check.missing.slice(0, 3).join("; ")})` : ""}`,
    ),
    `- Repeated uploads of the same key (idempotent retries): ${input.consistency.duplicateUploads}`,
    "",
    "Per-job records, depth samples, raw request samples, and resource observations are in the JSON artifact.",
  );
  return lines.join("\n");
}
