// server/src/benchmark/queue/phases.ts
// 使用者端影響：將 burst 期間持續進行的 feed 與貼文建立請求，依開始時間分到 before / burst / after 階段，
// 分別計算延遲與錯誤率，並與 burst 前的 p95 比較。

import { RequestSample, RunSummary, summarizeRun } from "../feed/stats";

export const TRAFFIC_GROUPS = ["feed", "post-creation"] as const;
export type TrafficGroup = (typeof TRAFFIC_GROUPS)[number];

export interface TrafficSample extends RequestSample {
  group: TrafficGroup;
  /** runner 時鐘 (Date.now()) */
  startedAtMs: number;
}

export interface TrafficPhase {
  name: string;
  startMs: number;
  endMs: number;
}

export interface PhaseSummary {
  name: string;
  durationMs: number;
  groups: Record<TrafficGroup, RunSummary>;
  /** 相對於第一個 phase（burst 前）的 p95 變化百分比 */
  p95ChangeVsBeforePercent: Record<TrafficGroup, number | null>;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function summarizeTrafficPhases(
  samples: readonly TrafficSample[],
  phases: readonly TrafficPhase[],
): PhaseSummary[] {
  const summaries = phases.map((phase) => {
    const inPhase = samples.filter((s) => s.startedAtMs >= phase.startMs && s.startedAtMs < phase.endMs);
    const durationMs = phase.endMs - phase.startMs;
    return {
      name: phase.name,
      durationMs,
      groups: Object.fromEntries(
        TRAFFIC_GROUPS.map((group) => [group, summarizeRun(inPhase.filter((s) => s.group === group), durationMs)]),
      ) as Record<TrafficGroup, RunSummary>,
    };
  });

  const before = summaries[0];
  return summaries.map((summary) => ({
    ...summary,
    p95ChangeVsBeforePercent: Object.fromEntries(
      TRAFFIC_GROUPS.map((group) => {
        const baseline = before?.groups[group].latencyMs?.p95;
        const current = summary.groups[group].latencyMs?.p95;
        return [group, baseline && current !== undefined ? round1(((current - baseline) / baseline) * 100) : null];
      }),
    ) as Record<TrafficGroup, number | null>,
  }));
}
