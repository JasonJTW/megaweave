// server/src/benchmark/feed/stats.ts
// Feed benchmark 統計：單次執行的延遲分佈、請求率、錯誤率與回應大小，以及跨重複次數取中位數。

export interface RequestSample {
  requestClass: string;
  latencyMs: number;
  /** HTTP 狀態碼；網路錯誤或逾時為 0 */
  status: number;
  /** 解碼後的回應 body 位元組數 */
  bytes: number;
  error?: string;
}

export interface LatencySummary {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

export interface RunSummary {
  requests: number;
  errors: number;
  errorRate: number;
  /** 每秒完成的請求數（含錯誤），以量測視窗長度計算 */
  requestRate: number;
  /** 只含成功請求 */
  latencyMs: LatencySummary | null;
  responseBytes: { total: number; mean: number | null };
  byRequestClass: Record<
    string,
    {
      requests: number;
      errors: number;
      latencyMs: LatencySummary | null;
      meanResponseBytes: number | null;
    }
  >;
}

export interface ScenarioSummary {
  repetitions: number;
  medianLatencyMs: { p50: number | null; p95: number | null; p99: number | null };
  medianRequestRate: number | null;
  medianErrorRate: number | null;
  medianResponseBytes: number | null;
}

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isSuccess = (sample: RequestSample) => sample.status >= 200 && sample.status < 300;

/** Nearest-rank percentile：回傳值一定是實際觀測到的樣本。 */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeLatencies(values: readonly number[]): LatencySummary | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    mean: round(total / values.length),
    max: Math.max(...values),
  };
}

function meanBytes(samples: readonly RequestSample[]): number | null {
  const successes = samples.filter(isSuccess);
  if (successes.length === 0) return null;
  return round(successes.reduce((sum, s) => sum + s.bytes, 0) / successes.length);
}

export function summarizeRun(samples: readonly RequestSample[], windowMs: number): RunSummary {
  const errors = samples.filter((s) => !isSuccess(s)).length;
  const byClass = new Map<string, RequestSample[]>();
  for (const s of samples) {
    const group = byClass.get(s.requestClass) ?? [];
    group.push(s);
    byClass.set(s.requestClass, group);
  }

  return {
    requests: samples.length,
    errors,
    errorRate: samples.length ? round(errors / samples.length, 4) : 0,
    requestRate: round(samples.length / (windowMs / 1000), 3),
    latencyMs: summarizeLatencies(samples.filter(isSuccess).map((s) => s.latencyMs)),
    responseBytes: {
      total: samples.reduce((sum, s) => sum + s.bytes, 0),
      mean: meanBytes(samples),
    },
    byRequestClass: Object.fromEntries(
      Array.from(byClass, ([requestClass, group]) => [
        requestClass,
        {
          requests: group.length,
          errors: group.filter((s) => !isSuccess(s)).length,
          latencyMs: summarizeLatencies(group.filter(isSuccess).map((s) => s.latencyMs)),
          meanResponseBytes: meanBytes(group),
        },
      ]),
    ),
  };
}

const present = (values: (number | null | undefined)[]) =>
  values.filter((value): value is number => typeof value === "number");

export function summarizeScenario(runs: readonly RunSummary[]): ScenarioSummary {
  return {
    repetitions: runs.length,
    medianLatencyMs: {
      p50: median(present(runs.map((run) => run.latencyMs?.p50))),
      p95: median(present(runs.map((run) => run.latencyMs?.p95))),
      p99: median(present(runs.map((run) => run.latencyMs?.p99))),
    },
    medianRequestRate: median(runs.map((run) => run.requestRate)),
    medianErrorRate: median(runs.map((run) => run.errorRate)),
    medianResponseBytes: median(present(runs.map((run) => run.responseBytes.mean))),
  };
}

const changePercent = (baseline: number | null, current: number | null) =>
  baseline && current !== null ? round(((current - baseline) / baseline) * 100) : null;

/** 現行策略相對於 baseline 的變化百分比；負值代表延遲降低。 */
export function compareStrategies(
  baseline: ScenarioSummary,
  current: ScenarioSummary,
): { p50ChangePercent: number | null; p95ChangePercent: number | null; p99ChangePercent: number | null } {
  return {
    p50ChangePercent: changePercent(baseline.medianLatencyMs.p50, current.medianLatencyMs.p50),
    p95ChangePercent: changePercent(baseline.medianLatencyMs.p95, current.medianLatencyMs.p95),
    p99ChangePercent: changePercent(baseline.medianLatencyMs.p99, current.medianLatencyMs.p99),
  };
}
