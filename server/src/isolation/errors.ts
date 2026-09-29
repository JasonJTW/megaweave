// server/src/isolation/errors.ts

/** 隔離環境安全檢查失敗：一律在任何清空或寫入資料儲存之前丟出。 */
export class IsolationSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IsolationSafetyError";
  }
}
