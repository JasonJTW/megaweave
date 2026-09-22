// server/src/benchmark/profiles.ts
// Benchmark profile 註冊表：每個 profile 自行宣告是否會操作目標環境與外部依賴模式，
// runner 依此強制執行安全檢查，呼叫端無法略過。

import { createFixtureProfile } from "./fixture/fixtureProfile";

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

export interface BenchmarkProfileOutcome {
  dataset: BenchmarkDataset;
  result: Record<string, unknown>;
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
  /** 無論成功或失敗都會呼叫，用於關閉連線。 */
  dispose?(): Promise<void>;
}

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
  ].map((profile) => [profile.name, profile]),
);
