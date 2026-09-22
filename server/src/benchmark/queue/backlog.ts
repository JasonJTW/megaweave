// server/src/benchmark/queue/backlog.ts
// Queue 深度取樣摘要：尚未完成的工作 (waiting + delayed + prioritized + active) 的峰值，
// 以及停止送入後第一次取樣到零的時間。取樣使用 runner 時鐘。

export interface QueueDepth {
  waiting: number;
  delayed: number;
  prioritized: number;
  active: number;
}

export interface DepthSample {
  atMs: number;
  byQueue: Record<string, QueueDepth>;
}

export interface DepthPeak {
  depth: number;
  /** 相對於開始送入工作的時間 */
  atOffsetMs: number;
}

export interface BacklogSummary {
  peak: DepthPeak;
  peakByQueue: Record<string, DepthPeak>;
  /** 停止送入後，第一次取樣到所有 queue 深度皆為 0 的時間；包含同時進行的 API 流量所排入的工作 */
  firstZeroAfterInjectionMs: number | null;
}

const depthOf = (depth: QueueDepth) => depth.waiting + depth.delayed + depth.prioritized + depth.active;
const totalDepth = (sample: DepthSample) =>
  Object.values(sample.byQueue).reduce((sum, depth) => sum + depthOf(depth), 0);

export function summarizeBacklog(
  samples: readonly DepthSample[],
  window: { injectionStartedAtMs: number; injectionEndedAtMs: number },
): BacklogSummary {
  const offset = (atMs: number) => atMs - window.injectionStartedAtMs;
  const peak: DepthPeak = { depth: 0, atOffsetMs: 0 };
  const peakByQueue: Record<string, DepthPeak> = {};

  for (const sample of samples) {
    const total = totalDepth(sample);
    if (total > peak.depth) Object.assign(peak, { depth: total, atOffsetMs: offset(sample.atMs) });
    for (const [queue, depth] of Object.entries(sample.byQueue)) {
      const current = peakByQueue[queue] ?? { depth: 0, atOffsetMs: 0 };
      peakByQueue[queue] = depthOf(depth) > current.depth ? { depth: depthOf(depth), atOffsetMs: offset(sample.atMs) } : current;
    }
  }

  const zero = samples.find((sample) => sample.atMs >= window.injectionEndedAtMs && totalDepth(sample) === 0);
  return {
    peak,
    peakByQueue,
    firstZeroAfterInjectionMs: zero ? zero.atMs - window.injectionEndedAtMs : null,
  };
}
