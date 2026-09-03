// server/src/queue/jobs/deliveryReconcile.ts
// Job 型別定義 + Processor：定期檢查非終態外送訂單與 Lalamove 官方狀態是否一致，修正 Webhook 遺失的問題

import { Job } from "bullmq";
import dbPool from "../../utils/db";
import { RowDataPacket } from "mysql2";
import { getLalamoveOrderDetail } from "../../services/lalamove";
import { mapLalamoveStatusToDbStatus } from "../../lalamove";
import { getSocketIO } from "../../utils/socket";

interface StaleDeliveryOrderRow extends RowDataPacket {
  id: number;
  lalamove_order_id: string;
  status: string;
  driver_name: string | null;
  updated_at: Date;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 執行外送訂單狀態對帳，分兩個階段：
 *
 * Phase 1 – PAYMENT_PENDING 逾期掃描
 *   掃描 expires_at < NOW() 的 PAYMENT_PENDING 訂單，標記為 EXPIRED，
 *   並將對應 payment 若仍是 PENDING 一起取消，記錄 failure_reason。
 *
 * Phase 2 – 進行中訂單 Lalamove 對帳
 *   掃描超過 3 分鐘未更新的 ASSIGNING_DRIVER / ON_GOING / PICKED_UP 訂單，
 *   主動查詢 Lalamove API，若發現狀態不一致則自動補正 DB 並發送 Socket.IO 即時推播。
 */
export async function processDeliveryReconciliation(_job?: Job): Promise<{
  checkedCount: number;
  reconciledCount: number;
  expiredCount: number;
}> {
  console.log("🔍 [Delivery Reconcile] Starting background reconciliation job...");

  // ── Phase 1: 將過期的 PAYMENT_PENDING 訂單標為 EXPIRED ──────────────────────
  const [expiredRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT d.id AS delivery_order_id, d.payment_id
     FROM delivery_orders d
     WHERE d.status = 'PAYMENT_PENDING'
       AND d.expires_at < NOW()`,
  );

  let expiredCount = 0;
  for (const row of expiredRows) {
    try {
      // 將 delivery_orders 標為 EXPIRED（用 AND status = 'PAYMENT_PENDING' 防止 race condition）
      await dbPool.query(
        `UPDATE delivery_orders
         SET status = 'EXPIRED',
             failure_reason = 'Payment not completed before quotation expiry',
             version = version + 1
         WHERE id = ? AND status = 'PAYMENT_PENDING'`,
        [row.delivery_order_id],
      );

      // 若對應的 payment 仍在 PENDING，一併取消
      if (row.payment_id) {
        await dbPool.query(
          `UPDATE payments
           SET status = 'CANCELLED'
           WHERE id = ? AND status = 'PENDING'`,
          [row.payment_id],
        );
      }

      // 記錄稽核事件
      await dbPool.query(
        `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload)
         VALUES (?, 'EXPIRED', ?)`,
        [
          row.delivery_order_id,
          JSON.stringify({
            source: "background_reconciliation_worker",
            reason: "Payment not completed before quotation expiry",
            expiredAt: new Date().toISOString(),
          }),
        ],
      );

      console.log(
        `⏰ [Delivery Reconcile] Marked delivery_order #${row.delivery_order_id} as EXPIRED (payment_id=${row.payment_id})`,
      );
      expiredCount++;
    } catch (expireErr) {
      console.error(
        `❌ [Delivery Reconcile] Failed to expire delivery_order #${row.delivery_order_id}:`,
        expireErr,
      );
    }
  }

  // ── Phase 2: 對帳 ASSIGNING_DRIVER / ON_GOING / PICKED_UP 的進行中訂單 ────────
  const [rows] = await dbPool.query<StaleDeliveryOrderRow[]>(
    `SELECT id, lalamove_order_id, status, driver_name, updated_at
     FROM delivery_orders
     WHERE status IN ('ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP')
       AND lalamove_order_id IS NOT NULL
       AND updated_at < NOW() - INTERVAL 3 MINUTE
     ORDER BY updated_at ASC
     LIMIT 30`,
  );

  if (!rows || rows.length === 0) {
    if (expiredCount === 0) {
      console.log("✅ [Delivery Reconcile] No stale in-progress orders found.");
    }
    return { checkedCount: 0, reconciledCount: 0, expiredCount };
  }

  console.log(`📦 [Delivery Reconcile] Found ${rows.length} potentially stale orders to verify.`);
  let reconciledCount = 0;
  const io = getSocketIO();

  for (const row of rows) {
    try {
      // 避免突發呼叫灌爆 API rate limit
      await sleep(300);

      const remoteDetail = await getLalamoveOrderDetail(row.lalamove_order_id);
      const remoteRawStatus = remoteDetail.status;
      const remoteDbStatus = mapLalamoveStatusToDbStatus(remoteRawStatus);
      const remoteDriver = remoteDetail.driver;

      const isStatusChanged = remoteDbStatus && remoteDbStatus !== row.status;
      const isDriverNewlyFound = !row.driver_name && remoteDriver?.name;

      if (isStatusChanged || isDriverNewlyFound) {
        console.warn(
          `⚠️ [Delivery Reconcile] Discrepancy detected for order ${row.lalamove_order_id}: local status='${row.status}' vs remote='${remoteDbStatus}'`,
        );

        const newStatus = remoteDbStatus || row.status;
        const driverName = remoteDriver?.name || null;
        const driverPhone = remoteDriver?.phone || null;
        const driverPlate = remoteDriver?.plateNumber || null;

        // 更新 DB 狀態與司機資訊
        await dbPool.query(
          `UPDATE delivery_orders
           SET status = ?,
               driver_name = COALESCE(?, driver_name),
               driver_phone = COALESCE(?, driver_phone),
               driver_plate_number = COALESCE(?, driver_plate_number),
               version = version + 1
           WHERE id = ?`,
          [newStatus, driverName, driverPhone, driverPlate, row.id],
        );

        // 記錄稽核事件
        await dbPool.query(
          `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload)
           VALUES (?, ?, ?)`,
          [
            row.id,
            newStatus,
            JSON.stringify({
              source: "background_reconciliation_worker",
              reconciledAt: new Date().toISOString(),
              remoteOrder: remoteDetail,
            }),
          ],
        );

        // 透過 Socket.IO 推播給前端
        if (io) {
          io.to(`delivery_${row.lalamove_order_id}`).emit("delivery_update", {
            orderId: row.lalamove_order_id,
            eventType: "RECONCILED_UPDATE",
            status: newStatus,
            driver: remoteDriver,
            updatedAt: new Date().toISOString(),
          });
          console.log(
            `📢 [Delivery Reconcile] Emitted reconciled status update for delivery_${row.lalamove_order_id}`,
          );
        }

        reconciledCount++;
      }
    } catch (orderErr) {
      console.error(
        `❌ [Delivery Reconcile] Error verifying order ${row.lalamove_order_id}:`,
        orderErr,
      );
    }
  }

  console.log(
    `🎉 [Delivery Reconcile] Finished. Verified: ${rows.length}, Reconciled: ${reconciledCount}, Expired: ${expiredCount}`,
  );
  return { checkedCount: rows.length, reconciledCount, expiredCount };
}
