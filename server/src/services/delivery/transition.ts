//* 外送單的狀態轉移：守衛（狀態機、比較並設定、事件時間）、稽核紀錄、退款、付款連動、推播，
//* 所有來源（Lalamove webhook、對帳 worker、使用者取消、sandbox）都走這裡，副作用才不會因來源而不同
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import { enqueueDeliveryRefund } from "../../queue/queues";
import type { Queryable } from "../orgService";
import { type DeliveryStatus, isRefundableStatus, predecessorsOf } from "./status";

/** 外送單的兩種識別：本機 id，或 Lalamove 的訂單編號 */
export type DeliveryOrderRef = { id: number } | { lalamoveOrderId: string };

export type DeliveryTransitionSource =
  | "lalamove_webhook"
  | "background_reconciliation_worker"
  | "user"
  | "sandbox";

export interface DeliveryTransitionOptions {
  source: DeliveryTransitionSource;
  /** 只從這個狀態轉移（比較並設定）：對帳 worker 讀到的狀態若期間被 webhook 改過，就放棄、下輪再對帳 */
  expectedFrom?: DeliveryStatus;
  /** Lalamove 事件時間：比已套用的事件舊就丟棄（Lalamove 不保證送達順序）。只有 webhook 帶 */
  eventTime?: Date;
  eventId?: string | null;
  /**
   * 原樣寫進 delivery_order_events.raw_payload（webhook 是 Lalamove 的 payload，其他來源自帶 `source`）；
   * 有 eventTime 時也寫進 raw_webhook_payload
   */
  payload: unknown;
  failureReason?: string | null;
  /** 退款原因（通知與退款紀錄）；省略時用 failureReason，再省略用狀態 */
  refundReason?: string;
  driver?: { name?: string | null; phone?: string | null; plateNumber?: string | null };
  /** 給了就推播 delivery_update；webhook 自己組含司機與座標的推播，所以不給 */
  io?: Server | null;
}

export interface DeliveryTransitionResult {
  /** false：不是合法轉移、事件過期，或期間已被改過；什麼都沒寫、沒推播 */
  applied: boolean;
  deliveryOrderId: number | null;
  lalamoveOrderId: string | null;
}

function keyOf(ref: DeliveryOrderRef): { sql: string; value: string | number } {
  return "id" in ref
    ? { sql: "id = ?", value: ref.id }
    : { sql: "lalamove_order_id = ?", value: ref.lalamoveOrderId };
}

export async function transitionDeliveryOrder(
  db: Queryable,
  ref: DeliveryOrderRef,
  to: DeliveryStatus,
  options: DeliveryTransitionOptions,
): Promise<DeliveryTransitionResult> {
  const key = keyOf(ref);
  const payload = JSON.stringify(options.payload ?? null);
  const sets = ["status = ?", "failure_reason = COALESCE(?, failure_reason)"];
  const setParams: unknown[] = [to, options.failureReason ?? null];
  if (options.driver) {
    sets.push(
      "driver_name = COALESCE(?, driver_name)",
      "driver_phone = COALESCE(?, driver_phone)",
      "driver_plate_number = COALESCE(?, driver_plate_number)",
    );
    setParams.push(
      options.driver.name ?? null,
      options.driver.phone ?? null,
      options.driver.plateNumber ?? null,
    );
  }
  const guards = [key.sql, "status IN (?)"];
  const guardParams: unknown[] = [key.value, predecessorsOf(to)];
  if (options.expectedFrom) {
    guards.push("status = ?");
    guardParams.push(options.expectedFrom);
  }
  if (options.eventTime) {
    //* status_updated_at 只存 Lalamove 事件時間，不混用本機時鐘
    sets.push("raw_webhook_payload = ?", "status_updated_at = ?");
    setParams.push(payload, options.eventTime);
    guards.push("(status_updated_at IS NULL OR status_updated_at <= ?)");
    guardParams.push(options.eventTime);
  }

  //* status IN (?) 需要 query() 展開陣列
  const [update] = await db.query<ResultSetHeader>(
    `UPDATE delivery_orders SET ${sets.join(", ")} WHERE ${guards.join(" AND ")}`,
    [...setParams, ...guardParams],
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, lalamove_order_id, payment_id FROM delivery_orders WHERE ${key.sql}`,
    [key.value],
  );
  const order = rows[0];
  const result: DeliveryTransitionResult = {
    applied: update.affectedRows > 0,
    deliveryOrderId: order ? Number(order.id) : null,
    lalamoveOrderId: (order?.lalamove_order_id as string | null) ?? null,
  };
  if (!result.applied || !order) return result;

  await db.query(
    `INSERT INTO delivery_order_events (delivery_order_id, event_id, event_status, raw_payload)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE received_at = CURRENT_TIMESTAMP`,
    [order.id, options.eventId ?? null, to, payload],
  );

  //* 付款窗口關了（過期或還沒付就取消）：還在 PENDING 的付款一併取消
  if ((to === "EXPIRED" || to === "CANCELLED") && order.payment_id != null) {
    await db.query("UPDATE payments SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'", [
      order.payment_id,
    ]);
  }

  if (isRefundableStatus(to)) {
    //* 退款 worker 再確認付款仍是 PAID，沒付過款的單會略過
    await enqueueDeliveryRefund({
      deliveryOrderId: result.deliveryOrderId!,
      reason: options.refundReason ?? options.failureReason ?? to,
    });
  }

  if (options.io) {
    //* client 以 Lalamove 訂單編號或本機 id 加入房間（socketHandlers），兩個都推
    const updatedAt = new Date().toISOString();
    const rooms = new Set([result.lalamoveOrderId, String(result.deliveryOrderId)].filter(Boolean));
    for (const room of rooms) {
      options.io.to(`delivery_${room}`).emit("delivery_update", { orderId: room, status: to, updatedAt });
    }
  }
  return result;
}
