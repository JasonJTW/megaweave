// server/src/queue/jobs/deliveryReconcile.ts
// Job 型別定義 + Processor：定期檢查非終態外送訂單與 Lalamove 官方狀態是否一致，修正 Webhook 遺失的問題

import { Job } from "bullmq";
import dbPool from "../../utils/db";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getLalamoveOrderDetail } from "../../services/lalamove";
import {
  REFUNDABLE_STATUSES,
  canTransition,
  lalamoveFailureReason,
} from "../../services/deliveryStatus";
import { enqueueDeliveryRefund } from "../queues";
import { mapLalamoveStatusToDbStatus } from "../../lalamove";
import { getSocketBroadcaster } from "../../utils/socket";
import {
  DISPATCH_OUTCOME_WAIT_MINUTES,
  type PaymentService,
} from "../../services/payment/paymentService";
import { createPaymentService } from "../../services/payment/defaultPaymentService";

interface StaleDeliveryOrderRow extends RowDataPacket {
  id: number;
  lalamove_order_id: string;
  status: string;
  driver_name: string | null;
  updated_at: Date;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let defaultPaymentService: PaymentService | null = null;
function getPaymentService(): PaymentService {
  defaultPaymentService ??= createPaymentService();
  return defaultPaymentService;
}

/**
 * 待付款外送單的付款窗口（分鐘）。綠界 AIO 信用卡付款頁有效 10 分鐘且無法調整，
 * 加上回呼延遲緩衝；窗口內即使報價過期也不關單，付款成功後由 PaymentService 重新報價派單。
 */
export const PAYMENT_WINDOW_MINUTES = 30;

/**
 * 付款後從未送出 T2（dispatch_attempted_at 為 NULL）多久，由 cron 補做派單。
 * 正常由付款後 60 秒的單筆檢查 job 處理；此值只在該 job 未能排入時兜底。
 */
export const UNDISPATCHED_GRACE_MINUTES = 2;

/** 終止後多久仍未退款才補排（給正常流程的退款 job 先跑） */
const REFUND_SWEEP_GRACE_MINUTES = 10;

/**
 * 執行外送訂單狀態對帳，分三個階段：
 *
 * Phase 0 – 中斷的派單 saga（單筆檢查 job 的兜底）+ 退款保底
 *   ORDER_PLACING 且「從未送出 T2 超過 UNDISPATCHED_GRACE_MINUTES」或「T2 結果不明超過等待期」者，
 *   交給 PaymentService.checkPlacingOrder：前者重新派單，後者判定未建單 → FAILED + 退款。
 *   再掃描「外送單已終止（FAILED / EXPIRED）但付款仍為 PAID」者補排退款：
 *   排入佇列失敗（例如 Redis 斷線）時綠界重送會被冪等閘門擋下，沒有這層就沒人會再退款。
 *
 * Phase 1 – PAYMENT_PENDING 逾期掃描
 *   掃描建立超過 PAYMENT_WINDOW_MINUTES 的 PAYMENT_PENDING 訂單（綠界付款頁已關閉），標記為 EXPIRED，
 *   並將對應 payment 若仍是 PENDING 一起取消，記錄 failure_reason。
 *   不以報價 expires_at 判斷：報價比綠界付款頁先過期，過早關單會讓仍在付款頁的使用者付了錢卻沒單。
 *
 * Phase 2 – 進行中訂單 Lalamove 對帳
 *   掃描超過 3 分鐘未更新的 ASSIGNING_DRIVER / ON_GOING / PICKED_UP 訂單，
 *   主動查詢 Lalamove API，若發現狀態不一致則自動補正 DB 並發送 Socket.IO 即時推播。
 */
export async function processDeliveryReconciliation(
  job?: Job,
  paymentService: () => PaymentService = getPaymentService,
): Promise<{
  checkedCount: number;
  reconciledCount: number;
  expiredCount: number;
  stuckPlacingCount: number;
}> {
  const logPrefix = "[Delivery Reconcile]";
  const log = async (msg: string) => {
    if (job) await job.log(`${logPrefix} ${msg}`);
  };
  const logWarn = async (msg: string) => {
    console.warn(`${logPrefix} ${msg}`);
    if (job) await job.log(`⚠️ ${logPrefix} ${msg}`);
  };
  const logError = async (msg: string, err?: unknown) => {
    console.error(`${logPrefix} ${msg}`, err);
    const errText =
      err instanceof Error ? err.stack || err.message : String(err);
    if (job) await job.log(`❌ ${logPrefix} ${msg}: ${errText}`);
  };

  await log("🔍 Starting background reconciliation job...");

  // ── Phase 0: 中斷的派單 saga（單筆檢查 job 未排入 / 未執行時兜底）────────────
  const [stuckRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT id
     FROM delivery_orders
     WHERE status = 'ORDER_PLACING'
       AND ((dispatch_attempted_at IS NULL AND updated_at < NOW() - INTERVAL ? MINUTE)
            OR dispatch_attempted_at < NOW(3) - INTERVAL ? MINUTE)`,
    [UNDISPATCHED_GRACE_MINUTES, DISPATCH_OUTCOME_WAIT_MINUTES],
  );

  let stuckPlacingCount = 0;
  for (const row of stuckRows) {
    try {
      const result = await paymentService().checkPlacingOrder(Number(row.id));
      await logWarn(`delivery_order #${row.id} stuck in ORDER_PLACING → ${result}`);
      if (result !== "NOOP") stuckPlacingCount++;
    } catch (stuckErr) {
      await logError(`Failed to recover stuck delivery_order #${row.id}`, stuckErr);
    }
  }

  // 退款保底：同一外送單以 jobId 去重，重複排入安全
  const [unrefundedRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT d.id
     FROM delivery_orders d
     JOIN payments p ON p.id = d.payment_id
     WHERE d.status IN (?)
       AND p.status = 'PAID'
       AND d.updated_at < NOW() - INTERVAL ? MINUTE`,
    [REFUNDABLE_STATUSES, REFUND_SWEEP_GRACE_MINUTES],
  );
  for (const row of unrefundedRows) {
    try {
      await enqueueDeliveryRefund({
        deliveryOrderId: Number(row.id),
        reason: "REFUND_SWEEP",
      });
    } catch (sweepErr) {
      await logError(`Failed to enqueue refund for delivery_order #${row.id}`, sweepErr);
    }
  }

  // ── Phase 1: 將付款窗口已關閉的 PAYMENT_PENDING 訂單標為 EXPIRED ──────────────
  const [expiredRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT d.id AS delivery_order_id, d.payment_id
     FROM delivery_orders d
     WHERE d.status = 'PAYMENT_PENDING'
       AND d.created_at < NOW() - INTERVAL ? MINUTE`,
    [PAYMENT_WINDOW_MINUTES],
  );

  let expiredCount = 0;
  for (const row of expiredRows) {
    try {
      // 將 delivery_orders 標為 EXPIRED（用 AND status = 'PAYMENT_PENDING' 防止 race condition）
      const [expireResult] = await dbPool.query<ResultSetHeader>(
        `UPDATE delivery_orders
         SET status = 'EXPIRED',
             failure_reason = 'Payment not completed within payment window'
         WHERE id = ? AND status = 'PAYMENT_PENDING'`,
        [row.delivery_order_id],
      );
      // 期間已付款（轉為 ORDER_PLACING）→ 不再過期，也不取消 payment
      if (expireResult.affectedRows === 0) continue;

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
            reason: "Payment not completed within payment window",
            expiredAt: new Date().toISOString(),
          }),
        ],
      );

      await log(
        `⏰ Marked delivery_order #${row.delivery_order_id} as EXPIRED (payment_id=${row.payment_id})`,
      );
      expiredCount++;
    } catch (expireErr) {
      await logError(
        `Failed to expire delivery_order #${row.delivery_order_id}`,
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
      await log("✅ No stale in-progress orders found.");
    }
    return { checkedCount: 0, reconciledCount: 0, expiredCount, stuckPlacingCount };
  }

  await log(`📦 Found ${rows.length} potentially stale orders to verify.`);
  let reconciledCount = 0;
  const io = getSocketBroadcaster();

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

      // 狀態機守衛：遠端狀態不是合法轉移時不覆寫狀態（仍可補司機資訊）
      const isValidTransition =
        isStatusChanged && canTransition(row.status, remoteDbStatus);
      if (isStatusChanged && !isValidTransition) {
        await logWarn(
          `Skipped invalid transition for order ${row.lalamove_order_id}: '${row.status}' -> '${remoteDbStatus}'`,
        );
      }

      if (isValidTransition || isDriverNewlyFound) {
        await logWarn(
          `Discrepancy detected for order ${row.lalamove_order_id}: local status='${row.status}' vs remote='${remoteDbStatus}'`,
        );

        const newStatus =
          isValidTransition && remoteDbStatus ? remoteDbStatus : row.status;
        const driverName = remoteDriver?.name || null;
        const driverPhone = remoteDriver?.phone || null;
        const driverPlate = remoteDriver?.plateNumber || null;

        const failureReason = isValidTransition
          ? lalamoveFailureReason(newStatus, remoteRawStatus)
          : null;

        // 更新 DB 狀態與司機資訊（AND status = 掃描時的狀態：期間若被 Webhook 改過則放棄，下輪再對帳）
        // 不更新 status_updated_at：該欄位只存 Lalamove 事件時間，避免與本機時鐘混用造成誤擋
        const [updateResult] = await dbPool.query<ResultSetHeader>(
          `UPDATE delivery_orders
           SET status = ?,
               driver_name = COALESCE(?, driver_name),
               driver_phone = COALESCE(?, driver_phone),
               driver_plate_number = COALESCE(?, driver_plate_number),
               failure_reason = COALESCE(?, failure_reason)
           WHERE id = ? AND status = ?`,
          [
            newStatus,
            driverName,
            driverPhone,
            driverPlate,
            failureReason,
            row.id,
            row.status,
          ],
        );
        if (updateResult.affectedRows === 0) {
          await logWarn(
            `Order ${row.lalamove_order_id} changed concurrently (was '${row.status}'), skipping`,
          );
          continue;
        }

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

        if (failureReason) {
          await enqueueDeliveryRefund({
            deliveryOrderId: row.id,
            reason: failureReason,
          });
        }

        // 透過 Socket.IO 推播給前端
        if (io) {
          io.to(`delivery_${row.lalamove_order_id}`).emit("delivery_update", {
            orderId: row.lalamove_order_id,
            eventType: "RECONCILED_UPDATE",
            status: newStatus,
            driver: remoteDriver,
            updatedAt: new Date().toISOString(),
          });
          await log(
            `📢 Emitted reconciled status update for delivery_${row.lalamove_order_id}`,
          );
        }

        reconciledCount++;
      }
    } catch (orderErr) {
      await logError(
        `Error verifying order ${row.lalamove_order_id}`,
        orderErr,
      );
    }
  }

  await log(
    `🎉 Finished. Verified: ${rows.length}, Reconciled: ${reconciledCount}, Expired: ${expiredCount}`,
  );
  return { checkedCount: rows.length, reconciledCount, expiredCount, stuckPlacingCount };
}
