// server/src/benchmark/targetMarker.ts
// Benchmark 目標伺服器的隔離標記：只有啟動時明確設定 BENCHMARK_TARGET_MARKER 的 API instance
// 才會在 /health 宣告自己是 benchmark 環境。Production 永遠不應設定此變數。

export const BENCHMARK_TARGET_MARKER_VALUE = "megaweave-isolated";
export const BENCHMARK_HEALTH_ENVIRONMENT = "isolated";

export function getBenchmarkHealthFields(
  env: NodeJS.ProcessEnv = process.env,
): { benchmarkEnvironment?: typeof BENCHMARK_HEALTH_ENVIRONMENT } {
  return env.BENCHMARK_TARGET_MARKER === BENCHMARK_TARGET_MARKER_VALUE
    ? { benchmarkEnvironment: BENCHMARK_HEALTH_ENVIRONMENT }
    : {};
}
