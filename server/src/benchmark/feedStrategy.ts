// server/src/benchmark/feedStrategy.ts
// feed-10k 對照實驗的策略選擇：benchmark runner 以 HTTP 標頭要求 full-hydration baseline，
// 只有帶隔離標記的 API instance 會採用並回應實際策略；production 一律忽略此標頭。

import { isBenchmarkTarget } from "./targetMarker";

export const FEED_STRATEGY_HEADER = "x-benchmark-feed-strategy";
export const FEED_STRATEGIES = ["late-materialization", "full-hydration"] as const;
export type FeedStrategy = (typeof FEED_STRATEGIES)[number];

/** 結果與摘要中的對照組名稱 */
export const FEED_STRATEGY_LABEL: Record<FeedStrategy, "current" | "baseline"> = {
  "late-materialization": "current",
  "full-hydration": "baseline",
};

/** 非 benchmark 目標回傳 null（不改變行為也不回應標頭）；否則回傳實際採用的策略。 */
export function resolveFeedStrategy(
  headerValue: string | string[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): FeedStrategy | null {
  if (!isBenchmarkTarget(env)) return null;
  return headerValue === "full-hydration" ? "full-hydration" : "late-materialization";
}
