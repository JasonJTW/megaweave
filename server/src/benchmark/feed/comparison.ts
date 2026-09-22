// server/src/benchmark/feed/comparison.ts
// Baseline (full-hydration) 與現行 (late-materialization) feed 策略的對照執行：
// 每個 cache 狀態 × 虛擬使用者數 × 重複次數，兩種策略以相同請求序列交替執行，並保留每次原始結果。

import type { BenchmarkInvariant } from "../profiles";
import { FEED_STRATEGY_LABEL, FeedStrategy } from "../feedStrategy";
import { createRandom, deriveSeed } from "../fixture/random";
import { runLoad, VirtualUser } from "./load";
import {
  diffSnapshots,
  ResourceObservations,
  ResourceSnapshot,
  startApiMemorySampler,
} from "./observations";
import {
  compareStrategies,
  isSuccess,
  median,
  RequestSample,
  RunSummary,
  ScenarioSummary,
  summarizeRun,
  summarizeScenario,
} from "./stats";
import { createVirtualUserScript, FeedPersona, WorkloadCatalog } from "./workload";

export type CacheState = "cold" | "warm";

export interface ComparisonPlan {
  seed: number;
  cacheStates: readonly CacheState[];
  virtualUsers: readonly number[];
  repetitions: number;
  /** 只用於 warm-cache；cold-cache 在清空快取後立即量測 */
  warmUpMs: number;
  measureMs: number;
  thinkTimeMs: { min: number; max: number };
}

export interface RunRecord {
  cacheState: CacheState;
  virtualUsers: number;
  repetition: number;
  strategy: FeedStrategy;
  warmUpRequests: number;
  summary: RunSummary;
  strategyMismatches: number;
  /** 成功請求的原始延遲，依完成順序，可重新計算任何百分位數 */
  latenciesMs: number[];
  /** 失敗請求的原始紀錄（最多保留 50 筆） */
  failedSamples: RequestSample[];
  observations: ResourceObservations;
}

export interface ScenarioRecord {
  cacheState: CacheState;
  virtualUsers: number;
  baseline: ScenarioSummary;
  current: ScenarioSummary;
  currentVsBaseline: ReturnType<typeof compareStrategies>;
  /** 每個請求平均造成的後端工作量（跨重複次數取中位數） */
  medianPerRequest: Record<FeedStrategy, PerRequestWork>;
}

interface PerRequestWork {
  mysqlQueries: number | null;
  mysqlInnodbRowsRead: number | null;
  mysqlBytesSent: number | null;
  redisVectorCommands: number | null;
  apiCpuMs: number | null;
}

export interface ComparisonResult {
  runs: RunRecord[];
  scenarios: ScenarioRecord[];
}

export interface ComparisonOptions {
  plan: ComparisonPlan;
  targetUrl: string;
  /** 依序分配給虛擬使用者；長度必須不小於最大虛擬使用者數 */
  personas: readonly FeedPersona[];
  catalog: WorkloadCatalog;
  sessionCookieName: string;
  resetCaches(): Promise<void>;
  takeSnapshot(): Promise<ResourceSnapshot>;
  startMemorySampler?: () => { stop(): { rssBytes: number; heapUsedBytes: number }[] };
  log?: (message: string) => void;
}

const MAX_FAILED_SAMPLES = 50;

/** 奇數輪 baseline 先跑、偶數輪 current 先跑，抵銷執行順序帶來的系統漂移 */
function strategyOrder(repetition: number): FeedStrategy[] {
  return repetition % 2 === 1
    ? ["full-hydration", "late-materialization"]
    : ["late-materialization", "full-hydration"];
}

function buildVirtualUsers(
  options: ComparisonOptions,
  count: number,
  scenarioKey: string,
): VirtualUser[] {
  if (options.personas.length < count) {
    throw new Error(`Feed comparison needs ${count} personas but only ${options.personas.length} were prepared`);
  }
  // 請求序列與 think time 由 scenario + 使用者編號決定，兩種策略在同一輪收到完全相同的序列
  return options.personas.slice(0, count).map((persona, index) => ({
    nextRequest: createVirtualUserScript(
      persona,
      options.catalog,
      createRandom(deriveSeed(options.plan.seed, "requests", scenarioKey, index)),
    ),
    random: createRandom(deriveSeed(options.plan.seed, "think-time", scenarioKey, index)),
  }));
}

const perRequest = (value: number | null, requests: number) =>
  value === null || requests === 0 ? null : value / requests;

function medianWork(runs: readonly RunRecord[]): PerRequestWork {
  const pick = (select: (run: RunRecord) => number | null) => {
    const values = runs
      .map((run) => perRequest(select(run), run.summary.requests))
      .filter((value): value is number => value !== null);
    const result = median(values);
    return result === null ? null : Math.round(result * 10) / 10;
  };
  return {
    mysqlQueries: pick((run) => run.observations.mysql.queries),
    mysqlInnodbRowsRead: pick((run) => run.observations.mysql.innodbRowsRead),
    mysqlBytesSent: pick((run) => run.observations.mysql.bytesSent),
    redisVectorCommands: pick((run) => run.observations.redisVector.commands),
    apiCpuMs: pick((run) => run.observations.api.cpuMs),
  };
}

export async function runComparison(options: ComparisonOptions): Promise<ComparisonResult> {
  const { plan } = options;
  const log = options.log ?? ((message: string) => console.log(message));
  const startSampler = options.startMemorySampler ?? (() => startApiMemorySampler(options.targetUrl));
  const loadOptions = {
    targetUrl: options.targetUrl,
    thinkTimeMs: plan.thinkTimeMs,
    sessionCookieName: options.sessionCookieName,
  };
  const runs: RunRecord[] = [];
  const scenarios: ScenarioRecord[] = [];
  const totalRuns = plan.cacheStates.length * plan.virtualUsers.length * plan.repetitions * 2;

  for (const cacheState of plan.cacheStates) {
    for (const virtualUsers of plan.virtualUsers) {
      for (let repetition = 1; repetition <= plan.repetitions; repetition++) {
        for (const strategy of strategyOrder(repetition)) {
          const scenarioKey = `${cacheState}:${virtualUsers}:${repetition}`;
          await options.resetCaches();

          let warmUpRequests = 0;
          if (cacheState === "warm") {
            const warmUp = await runLoad({
              ...loadOptions,
              strategy,
              virtualUsers: buildVirtualUsers(options, virtualUsers, `${scenarioKey}:warm-up`),
              durationMs: plan.warmUpMs,
            });
            warmUpRequests = warmUp.samples.length;
          }

          const sampler = startSampler();
          const start = await options.takeSnapshot();
          const load = await runLoad({
            ...loadOptions,
            strategy,
            virtualUsers: buildVirtualUsers(options, virtualUsers, scenarioKey),
            durationMs: plan.measureMs,
          });
          const end = await options.takeSnapshot();
          const memorySamples = sampler.stop();

          const summary = summarizeRun(load.samples, plan.measureMs);
          runs.push({
            cacheState,
            virtualUsers,
            repetition,
            strategy,
            warmUpRequests,
            summary,
            strategyMismatches: load.strategyMismatches,
            latenciesMs: load.samples.filter(isSuccess).map((s) => s.latencyMs),
            failedSamples: load.samples.filter((s) => !isSuccess(s)).slice(0, MAX_FAILED_SAMPLES),
            observations: diffSnapshots(start, end, memorySamples),
          });
          log(
            `[feed] ${runs.length}/${totalRuns} ${cacheState} ${virtualUsers} VU rep ${repetition} ${FEED_STRATEGY_LABEL[strategy]}: ` +
              `${summary.requests} requests, p95 ${summary.latencyMs?.p95 ?? "n/a"} ms, ${summary.errors} errors`,
          );
        }
      }

      const scenarioRuns = runs.filter((r) => r.cacheState === cacheState && r.virtualUsers === virtualUsers);
      const byStrategy = (strategy: FeedStrategy) => scenarioRuns.filter((r) => r.strategy === strategy);
      const baseline = summarizeScenario(byStrategy("full-hydration").map((r) => r.summary));
      const current = summarizeScenario(byStrategy("late-materialization").map((r) => r.summary));
      scenarios.push({
        cacheState,
        virtualUsers,
        baseline,
        current,
        currentVsBaseline: compareStrategies(baseline, current),
        medianPerRequest: {
          "full-hydration": medianWork(byStrategy("full-hydration")),
          "late-materialization": medianWork(byStrategy("late-materialization")),
        },
      });
    }
  }

  return { runs, scenarios };
}

export function evaluateInvariants(result: ComparisonResult): BenchmarkInvariant[] {
  const requests = result.runs.reduce((sum, run) => sum + run.summary.requests, 0);
  const errors = result.runs.reduce((sum, run) => sum + run.summary.errors, 0);
  const mismatches = result.runs.reduce((sum, run) => sum + run.strategyMismatches, 0);
  const vectorFailures = result.runs.reduce(
    (sum, run) => sum + (run.observations.feedCaches.candidateVectorReadFailures ?? 0),
    0,
  );
  const invariant = (name: string, ok: boolean, detail: string): BenchmarkInvariant =>
    ok ? { name, ok } : { name, ok, detail };

  return [
    invariant("no-http-errors", errors === 0, `${errors} failed requests out of ${requests}`),
    invariant(
      "requested-strategy-applied",
      mismatches === 0,
      `${mismatches} response${mismatches === 1 ? "" : "s"} did not apply the requested strategy`,
    ),
    invariant(
      "no-candidate-vector-read-failures",
      vectorFailures === 0,
      `${vectorFailures} failed candidate vector reads degraded personalized ranking`,
    ),
  ];
}
