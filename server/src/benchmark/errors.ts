// server/src/benchmark/errors.ts

import { IsolationSafetyError } from "../isolation/errors";

/** Benchmark 安全檢查失敗：一律在任何寫入、負載或故障注入前丟出。 */
export class BenchmarkSafetyError extends IsolationSafetyError {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkSafetyError";
  }
}
