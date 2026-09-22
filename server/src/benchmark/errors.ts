// server/src/benchmark/errors.ts

/** Benchmark 安全檢查失敗：一律在任何寫入、負載或故障注入前丟出。 */
export class BenchmarkSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkSafetyError";
  }
}
