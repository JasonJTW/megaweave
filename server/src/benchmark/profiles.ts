// server/src/benchmark/profiles.ts
// Benchmark profile 註冊表：每個 profile 自行宣告是否會操作目標環境與外部依賴模式，
// runner 依此強制執行安全檢查，呼叫端無法略過。

export const DEPENDENCY_MODES = ["mock", "benchmark", "real-probe"] as const;
export type DependencyMode = (typeof DEPENDENCY_MODES)[number];

export interface BenchmarkDataset {
  version: string;
  counts: Record<string, number>;
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
  /** 會對目標寫入資料、產生負載、重啟服務或注入故障時必須為 true。 */
  touchesTarget: boolean;
  workload: Record<string, unknown>;
  dependencies: Record<string, DependencyMode>;
  run(context: BenchmarkProfileContext): Promise<BenchmarkProfileOutcome>;
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

export const benchmarkProfiles: Record<string, BenchmarkProfile> = {
  [environmentCheck.name]: environmentCheck,
};
