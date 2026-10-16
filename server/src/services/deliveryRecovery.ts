// server/src/services/deliveryRecovery.ts
// 派單 saga 的復原：Lalamove 已建單但我們沒記下 orderId（T2 回應遺失 / T3 寫入失敗 / 當機）時，
// 以 Lalamove ORDER_CREATED webhook 帶回的 quotationId 認領；外送單已被判定失敗並退款者，取消該 Lalamove 單

import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type CancelLalamoveOrderFn = (orderId: string) => Promise<unknown>;

export type AdoptionResult =
  | "ADOPTED" // ORDER_PLACING 外送單補上 lalamove_order_id，轉為 ASSIGNING_DRIVER
  | "ALREADY_LINKED" // 正常流程（T3）已寫入，無事
  | "ORPHAN_CANCELLED" // 外送單已 FAILED（逾時補償）或已綁定另一張單 → 取消此 Lalamove 單
  | "NOT_FOUND";

/**
 * 取消沒有對應有效外送單的 Lalamove 訂單（補償 T2），並盡量把 orderId 記到外送單上供稽核。
 * 取消失敗時只告警：此時使用者可能已被退款、司機仍會前往，需人工處理。
 */
export async function cancelOrphanLalamoveOrder(
  db: Pool,
  cancel: CancelLalamoveOrderFn | undefined,
  params: { deliveryOrderId: number; lalamoveOrderId: string; reason: string },
): Promise<boolean> {
  const { deliveryOrderId, lalamoveOrderId, reason } = params;

  await db.query(
    "UPDATE delivery_orders SET lalamove_order_id = ? WHERE id = ? AND lalamove_order_id IS NULL",
    [lalamoveOrderId, deliveryOrderId],
  );

  try {
    if (!cancel) throw new Error("cancelLalamoveOrder is unavailable");
    await cancel(lalamoveOrderId);
    console.warn(
      `[ALERT] Cancelled orphan Lalamove order ${lalamoveOrderId} for delivery order ${deliveryOrderId}: ${reason}`,
    );
    return true;
  } catch (cancelErr) {
    console.error(
      `[ALERT] Failed to cancel orphan Lalamove order ${lalamoveOrderId} for delivery order ${deliveryOrderId} (${reason}); manual action required`,
      cancelErr,
    );
    return false;
  }
}

/**
 * 以 quotationId 認領 Lalamove 訂單。quotationId 在建單前就已寫入 delivery_orders（含重估價），
 * 因此即使我們從未收到 Place Order 的回應，也能對回外送單。
 */
export async function adoptLalamoveOrder(
  db: Pool,
  cancel: CancelLalamoveOrderFn | undefined,
  params: { lalamoveOrderId: string; quotationId: string; shareLink?: string | null },
): Promise<{ result: AdoptionResult; deliveryOrderId: number | null }> {
  const { lalamoveOrderId, quotationId, shareLink } = params;

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id, status, lalamove_order_id FROM delivery_orders WHERE quotation_id = ? LIMIT 1",
    [quotationId],
  );
  const row = rows[0];
  if (!row) return { result: "NOT_FOUND", deliveryOrderId: null };

  const deliveryOrderId = Number(row.id);
  if (row.lalamove_order_id === lalamoveOrderId) {
    return { result: "ALREADY_LINKED", deliveryOrderId };
  }

  if (row.status === "ORDER_PLACING" && !row.lalamove_order_id) {
    const [adoptResult] = await db.query<ResultSetHeader>(
      `UPDATE delivery_orders
       SET status = 'ASSIGNING_DRIVER', lalamove_order_id = ?, share_link = COALESCE(?, share_link)
       WHERE id = ? AND status = 'ORDER_PLACING' AND lalamove_order_id IS NULL`,
      [lalamoveOrderId, shareLink || null, deliveryOrderId],
    );
    if (adoptResult.affectedRows > 0) {
      await db.query(
        `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload)
         VALUES (?, 'ASSIGNING_DRIVER', ?)`,
        [
          deliveryOrderId,
          JSON.stringify({ source: "lalamove_webhook_adoption", lalamoveOrderId, quotationId }),
        ],
      );
      console.warn(
        `[Delivery Recovery] Adopted Lalamove order ${lalamoveOrderId} into delivery order ${deliveryOrderId}`,
      );
      return { result: "ADOPTED", deliveryOrderId };
    }
    // 搶占失敗：T3 或對帳剛好同時改了這列 → 重讀一次再判斷
    return adoptLalamoveOrder(db, cancel, params);
  }

  await cancelOrphanLalamoveOrder(db, cancel, {
    deliveryOrderId,
    lalamoveOrderId,
    reason: `delivery order is ${row.status}${
      row.lalamove_order_id ? ` and already linked to ${row.lalamove_order_id}` : ""
    }`,
  });
  return { result: "ORPHAN_CANCELLED", deliveryOrderId };
}
