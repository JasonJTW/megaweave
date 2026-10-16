// server/src/queue/jobs/deliveryRefund.ts
// Job 型別定義 + Processor：外送單被 Lalamove 終止（REJECTED / EXPIRED）後，對已付款訂單自動全額退款並通知使用者

import { Job } from "bullmq";
import { RowDataPacket } from "mysql2";
import dbPool from "../../utils/db";
import { notifyDeliveryUser } from "../../services/deliveryNotifier";
import { isRefundableStatus } from "../../services/deliveryStatus";
import type { PaymentService } from "../../services/payment/paymentService";
import { createPaymentService } from "../../services/payment/defaultPaymentService";

export interface DeliveryRefundJobData {
  deliveryOrderId: number;
  /** 例如 LALAMOVE_REJECTED / LALAMOVE_EXPIRED / LALAMOVE_DISPATCH_FAILED / ORDER_PLACING_TIMEOUT / PAID_AFTER_ORDER_CLOSED */
  reason: string;
}

interface RefundTargetRow extends RowDataPacket {
  user_id: number;
  status: string;
  payment_id: number;
  payment_status: string;
}

let paymentService: PaymentService | null = null;
function getPaymentService(): PaymentService {
  paymentService ??= createPaymentService();
  return paymentService;
}

export async function processDeliveryRefund(
  job: Job<DeliveryRefundJobData>,
  service: PaymentService = getPaymentService(),
): Promise<{ refunded: boolean }> {
  const { deliveryOrderId, reason } = job.data;

  const [rows] = await dbPool.query<RefundTargetRow[]>(
    `SELECT d.user_id, d.status, d.payment_id, p.status AS payment_status
     FROM delivery_orders d
     JOIN payments p ON p.id = d.payment_id
     WHERE d.id = ?`,
    [deliveryOrderId],
  );
  const target = rows[0];

  // 冪等：只有「Lalamove 終止 + 仍為全額已付款」才退款；重試或重複排入時會因狀態已變更而跳過
  if (!target || !isRefundableStatus(target.status) || target.payment_status !== "PAID") {
    await job.log(
      `Skip delivery_order #${deliveryOrderId}: status=${target?.status} payment=${target?.payment_status}`,
    );
    return { refunded: false };
  }

  try {
    const ok = await service.refund(target.payment_id, `AUTO_REFUND: ${reason}`);
    if (!ok) throw new Error(`Refund rejected by provider for payment #${target.payment_id}`);
  } catch (refundErr) {
    // 最後一次重試仍失敗 → 告警 + 通知使用者由客服處理（refund() 對結果不明者保留 PENDING，不會自動重刷）
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      console.error(
        `[ALERT] Auto-refund for delivery_order #${deliveryOrderId} (payment #${target.payment_id}) failed after all retries; manual action required`,
        refundErr,
      );
      await notifyDeliveryUser(deliveryOrderId, "REFUND_FAILED");
    }
    throw refundErr;
  }

  await notifyDeliveryUser(deliveryOrderId, "REFUNDED", reason);
  return { refunded: true };
}
