// server/src/benchmark/queue/invariants.ts
// Queue burst 的通過條件：所有工作都有帳可查、沒有終止失敗、持久化結果一致，且使用者流量在每個階段都持續運作。

import type { BenchmarkInvariant } from "../profiles";
import type { JobAccounting } from "./accounting";
import type { ConsistencyResult } from "./consistency";
import { PhaseSummary, TRAFFIC_GROUPS, TrafficSample } from "./phases";

export interface QueueBurstInvariantInput {
  /** 依計畫應送入的 burst job 數 */
  plannedJobs: number;
  /** producer 因冷卻期未排入的 job 數 */
  deduplicated: number;
  /** burst 工作是否在 drain 逾時前全部終止 */
  drained: boolean;
  drainTimeoutMs: number;
  accounting: JobAccounting;
  consistency: ConsistencyResult;
  phases: readonly PhaseSummary[];
  samples: readonly TrafficSample[];
}

const invariant = (name: string, ok: boolean, detail: string): BenchmarkInvariant => (ok ? { name, ok } : { name, ok, detail });

export function evaluateQueueBurstInvariants(input: QueueBurstInvariantInput): BenchmarkInvariant[] {
  const burst = input.accounting.byOrigin.burst.total;
  const traffic = input.accounting.byOrigin.traffic.total;
  const failures = burst.terminalFailed + traffic.terminalFailed;
  const failedRequests = input.samples.filter((sample) => sample.status < 200 || sample.status >= 300).length;
  const unserved = input.phases.flatMap((phase) =>
    TRAFFIC_GROUPS.filter((group) => (phase.groups[group].latencyMs?.count ?? 0) === 0).map((group) => `${group} in ${phase.name}`),
  );
  const burstComplete =
    input.drained && input.deduplicated === 0 && burst.submitted === input.plannedJobs && burst.unfinished === 0 && burst.unobserved === 0;

  return [
    invariant(
      "burst-work-accounted",
      burstComplete,
      `${burst.submitted} of ${input.plannedJobs} jobs submitted (${input.deduplicated} deduplicated by the producer); ` +
        `${burst.unfinished} unfinished and ${burst.unobserved} never observed after ${input.drainTimeoutMs / 1000}s`,
    ),
    // 使用者流量排入的工作也必須完成，否則其貼文的持久化結果無法驗證
    invariant(
      "traffic-work-accounted",
      traffic.unfinished === 0 && traffic.unobserved === 0,
      `${traffic.unfinished} of ${traffic.submitted} jobs enqueued by the API did not finish`,
    ),
    invariant("no-terminal-failures", failures === 0, `${failures} jobs exhausted their attempts with mocked dependencies`),
    invariant(
      "durable-effects-consistent",
      input.consistency.checks.every((check) => check.ok),
      input.consistency.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.name}: ${check.actual}/${check.expected}`)
        .join("; "),
    ),
    invariant("traffic-throughout-burst", unserved.length === 0, `no successful requests for ${unserved.join(", ")}`),
    invariant("no-http-errors", failedRequests === 0, `${failedRequests} failed requests out of ${input.samples.length}`),
  ];
}
