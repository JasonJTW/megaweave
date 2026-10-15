// server/src/queue/jobs/deliveryRefund.ts
// Job 型別定義 + Processor：外送單被 Lalamove 終止（REJECTED / EXPIRED）後，對已付款訂單自動全額退款並通知使用者

import { Job } from "bullmq";
import { RowDataPacket } from "mysql2";
import dbPool from "../../utils/db";
import { getSocketIO } from "../../utils/socket";
import { createNotification } from "../../utils/notificationService";
import { isRefundableStatus } from "../../services/deliveryStatus";
import type { PaymentService } from "../../services/payment/paymentService";
import { createPaymentService } from "../../services/payment/defaultPaymentService";

export interface DeliveryRefundJobData {
  deliveryOrderId: number;
  /** 例如 LALAMOVE_REJECTED / LALAMOVE_EXPIRED */
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

  const ok = await service.refund(target.payment_id, `AUTO_REFUND: ${reason}`);
  if (!ok) throw new Error(`Refund rejected by provider for payment #${target.payment_id}`);

  try {
    await createNotification(getSocketIO(), {
      recipient_id: target.user_id,
      type: "ORDER_UPDATE",
      title: "Delivery Refunded",
      content:
        reason === "LALAMOVE_EXPIRED"
          ? "No driver accepted your delivery in time. Your payment has been refunded."
          : "Your delivery could not be fulfilled by Lalamove. Your payment has been refunded.",
    });
  } catch (notifyErr) {
    console.error(`[delivery-refund] Notification failed for #${deliveryOrderId}:`, notifyErr);
  }

  return { refunded: true };
}
