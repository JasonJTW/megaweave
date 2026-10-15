// server/src/services/deliveryStatus.ts
// delivery_orders.status 狀態機：所有 UPDATE 以 `WHERE status IN (合法前置狀態)` 守衛，
// 防止亂序 / 重送的 Webhook、對帳 Worker 與使用者操作互相覆蓋（例如晚到的 ON_GOING 蓋掉 COMPLETED）

export const DELIVERY_STATUSES = [
  "QUOTED",
  "PAYMENT_PENDING",
  "ORDER_PLACING",
  "ASSIGNING_DRIVER",
  "ON_GOING",
  "PICKED_UP",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** from → 可轉移的 to。終態（COMPLETED / FAILED / CANCELLED / EXPIRED）不可再轉移。 */
const TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  QUOTED: ["PAYMENT_PENDING", "EXPIRED"],
  PAYMENT_PENDING: ["ORDER_PLACING", "EXPIRED", "CANCELLED"],
  ORDER_PLACING: ["ASSIGNING_DRIVER", "FAILED"],
  // Webhook 可能遺失中間事件，允許跳躍前進
  ASSIGNING_DRIVER: [
    "ON_GOING",
    "PICKED_UP",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
  ],
  // 司機拒單：Lalamove 會從 ON_GOING / PICKED_UP 退回 ASSIGNING_DRIVER 重新配對；
  // 達拒單上限才轉 REJECTED（對應 FAILED 終態）。見 https://developers.lalamove.com/ Driver Rejection
  ON_GOING: ["ASSIGNING_DRIVER", "PICKED_UP", "COMPLETED", "CANCELLED", "FAILED"],
  PICKED_UP: ["ASSIGNING_DRIVER", "COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return DELIVERY_STATUSES.includes(value as DeliveryStatus);
}

export function canTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!isDeliveryStatus(from) || !isDeliveryStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/** 可轉移至 `to` 的前置狀態，供 `WHERE status IN (?)` 使用（需搭配 pool.query 展開陣列） */
export function predecessorsOf(to: DeliveryStatus): DeliveryStatus[] {
  return DELIVERY_STATUSES.filter((from) => TRANSITIONS[from].includes(to));
}

/** Lalamove 端失敗（REJECTED / FAILED）或無司機接單（EXPIRED）：已付款者需自動退款 */
export const REFUNDABLE_STATUSES: readonly DeliveryStatus[] = ["FAILED", "EXPIRED"];

export function isRefundableStatus(status: string | null | undefined): boolean {
  return REFUNDABLE_STATUSES.includes(status as DeliveryStatus);
}

/** 終止原因，例如 LALAMOVE_REJECTED；非失敗類狀態回傳 null（保留原 failure_reason） */
export function lalamoveFailureReason(
  dbStatus: string | null | undefined,
  rawStatus: string | null | undefined,
): string | null {
  if (!isRefundableStatus(dbStatus)) return null;
  const raw = String(rawStatus ?? dbStatus)
    .replace(/[\s-]/g, "_")
    .toUpperCase();
  return `LALAMOVE_${raw}`;
}
