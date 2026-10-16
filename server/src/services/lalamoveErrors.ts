// server/src/services/lalamoveErrors.ts
// Lalamove 建單錯誤分類：決定派單 saga 能否立即補償（退款）

/**
 * - REJECTED：Lalamove 明確拒絕（4xx，例如報價無效、餘額不足）→ 確定沒有建單，可立即補償
 * - UNKNOWN：網路錯誤 / 逾時 / 5xx → Lalamove 可能已建單，不可退款，等 ORDER_CREATED webhook 認領
 */
export type LalamoveDispatchOutcome = "REJECTED" | "UNKNOWN";

export class LalamoveDispatchError extends Error {
  constructor(
    message: string,
    readonly outcome: LalamoveDispatchOutcome,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "LalamoveDispatchError";
  }
}

/** 依 HTTP 狀態分類；408 視為結果不明（伺服器可能已處理） */
export function classifyLalamoveHttpStatus(
  httpStatus: number | undefined,
): LalamoveDispatchOutcome {
  if (httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408) {
    return "REJECTED";
  }
  return "UNKNOWN";
}
