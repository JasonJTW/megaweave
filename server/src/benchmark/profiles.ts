// server/src/benchmark/profiles.ts
// Benchmark profile 註冊表：每個 profile 自行宣告是否會操作目標環境與外部依賴模式，
// runner 依此強制執行安全檢查，呼叫端無法略過。

import { createFeedProfile } from "./feed/feedProfile";
import { createFixtureProfile } from "./fixture/fixtureProfile";
import { createQueueBurstProfile, QueueBurstPlan } from "./queue/queueBurstProfile";

export const DEPENDENCY_MODES = ["mock", "benchmark", "real-probe"] as const;
export type DependencyMode = (typeof DEPENDENCY_MODES)[number];

export interface BenchmarkDataset {
  version: string;
  counts: Record<string, number>;
  /** 資料內容雜湊；相同代表兩次 benchmark 使用完全相同的資料 */
  fingerprint?: string;
}

export interface BenchmarkProfileContext {
  /** 已通過 /health 隔離標記驗證的目標 base URL；只有 touchesTarget 的 profile 會收到。 */
  targetUrl?: string;
}

/** Profile 自行判定的通過條件；任一失敗時仍寫出結果，但 runner 會回報失敗。 */
export interface BenchmarkInvariant {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface BenchmarkProfileOutcome {
  dataset: BenchmarkDataset;
  result: Record<string, unknown>;
  invariants?: BenchmarkInvariant[];
  /** Markdown 摘要中取代完整 result JSON 的內容；result 含大量原始資料時使用。 */
  summary?: string;
}

export interface BenchmarkProfile {
  name: string;
  description: string;
  /** 會對目標 API 產生負載、重啟服務或注入故障時必須為 true；runner 會先驗證 /health 標記。 */
  touchesTarget: boolean;
  workload: Record<string, unknown>;
  dependencies: Record<string, DependencyMode>;
  /** Profile 專屬的安全檢查（例如資料庫標記），在 runner 檢查之後、run() 之前執行。 */
  assertSafeToRun?(): Promise<void>;
  run(context: BenchmarkProfileContext): Promise<BenchmarkProfileOutcome>;
  /** 回報 profile 使用的服務實際版本（例如 MySQL / Redis），在 run() 之後、dispose() 之前呼叫。 */
  describeServices?(): Promise<Record<string, string>>;
  /** 無論成功或失敗都會呼叫，用於關閉連線。 */
  dispose?(): Promise<void>;
}

/** Queue burst 期間持續的低量使用者流量：5 位瀏覽 feed 的使用者與 2 位發文者 */
const QUEUE_BURST_TRAFFIC: Pick<
  QueueBurstPlan,
  "feedVirtualUsers" | "postVirtualUsers" | "feedThinkTimeMs" | "postThinkTimeMs" | "depthSampleIntervalMs"
> = {
  feedVirtualUsers: 5,
  postVirtualUsers: 2,
  feedThinkTimeMs: { min: 3_000, max: 8_000 },
  postThinkTimeMs: { min: 20_000, max: 40_000 },
  depthSampleIntervalMs: 1_000,
};

const environmentCheck: BenchmarkProfile = {
  name: "environment-check",
  description:
    "Validates the environment gate and artifact contract without touching any target",
  touchesTarget: false,
  workload: { requests: 0 },
  dependencies: {},
  run: async () => ({
    dataset: { version: "none", counts: {} },
    result: { status: "environment-ready" },
  }),
};

export const benchmarkProfiles: Record<string, BenchmarkProfile> = Object.fromEntries(
  [
    environmentCheck,
    createFixtureProfile({ name: "fixture-1k", posts: 1_000 }),
    createFixtureProfile({ name: "fixture-10k", posts: 10_000 }),
    createFeedProfile({
      name: "feed-10k",
      posts: 10_000,
      plan: {
        cacheStates: ["cold", "warm"],
        virtualUsers: [5, 10, 20],
        repetitions: 3,
        warmUpMs: 60_000,
        measureMs: 240_000,
        thinkTimeMs: { min: 3_000, max: 8_000 },
      },
    }),
    // 開發機上驗證 feed profile 流程用；數據不可作為效能結論
    createFeedProfile({
      name: "feed-1k-smoke",
      posts: 1_000,
      plan: {
        cacheStates: ["cold", "warm"],
        virtualUsers: [5],
        repetitions: 1,
        warmUpMs: 10_000,
        measureMs: 30_000,
        thinkTimeMs: { min: 3_000, max: 8_000 },
      },
    }),
    createQueueBurstProfile({
      name: "queue-burst-500",
      posts: 10_000,
      plan: {
        units: 500,
        injectionMs: 30_000,
        baselineMs: 120_000,
        recoveryMs: 120_000,
        drainTimeoutMs: 30 * 60_000,
        ...QUEUE_BURST_TRAFFIC,
      },
    }),
    // 開發機上驗證 queue burst 流程用；數據不可作為容量結論
    createQueueBurstProfile({
      name: "queue-burst-1k-smoke",
      posts: 1_000,
      plan: {
        units: 50,
        injectionMs: 5_000,
        baselineMs: 20_000,
        recoveryMs: 20_000,
        drainTimeoutMs: 5 * 60_000,
        ...QUEUE_BURST_TRAFFIC,
      },
    }),
  ].map((profile) => [profile.name, profile]),
);
