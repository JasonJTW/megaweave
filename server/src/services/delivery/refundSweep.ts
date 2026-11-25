//* 退款保底：排退款可能失敗（Redis 暫時連不上、程序中斷），對帳 worker 定期找出「該退卻還沒退」的單重排
import type { RowDataPacket } from "mysql2/promise";
import type { Queryable } from "../orgService";
import { REFUNDABLE_STATUSES, SWEPT_REFUND_STATUSES } from "./status";

/**
 * 已付款、處於可退款狀態、超過 `graceMinutes` 沒有變動，而且是失敗類狀態（FAILED、EXPIRED）
 * 或由 transitionDeliveryOrder 標記過 refund_due_at 的外送單 id。
 * 沒有標記的 CANCELLED 是 CANCELLED 開始退款前的舊單，不回溯退款
 */
export async function listOrdersOwedRefund(
  db: Pick<Queryable, "query">,
  graceMinutes: number,
): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT d.id
     FROM delivery_orders d
     JOIN payments p ON p.id = d.payment_id
     WHERE p.status = 'PAID'
       AND d.status IN (?)
       AND (d.status IN (?) OR d.refund_due_at IS NOT NULL)
       AND d.updated_at < NOW() - INTERVAL ? MINUTE`,
    [REFUNDABLE_STATUSES, SWEPT_REFUND_STATUSES, graceMinutes],
  );
  return rows.map((row) => Number(row.id));
}
