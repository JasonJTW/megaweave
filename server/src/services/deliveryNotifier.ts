// server/src/services/deliveryNotifier.ts
// 外送訂單叫車失敗 / 退款結果通知：站內通知（DB + Socket.IO）+ Email（BullMQ，由 email job 依收件人語系產生文案）。
// 通知為盡力而為：任何失敗只記錄，不影響派單與退款流程。

import { RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { getSocketBroadcaster } from "../utils/socket";
import { createNotification } from "../utils/notificationService";
import { enqueueSendEmail } from "../queue/queues";
import { resolveLocale } from "../utils/i18n";
import { getAppOrigin } from "../utils/env";
import { getDeliveryNoticeCopy, type DeliveryNoticeEvent } from "./deliveryNoticeCopy";

export async function notifyDeliveryUser(
  deliveryOrderId: number,
  event: DeliveryNoticeEvent,
  reason?: string,
): Promise<void> {
  try {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT d.user_id, p.merchant_trade_no, p.amount, u.email, u.locale
       FROM delivery_orders d
       JOIN payments p ON p.id = d.payment_id
       JOIN users u ON u.id = d.user_id
       WHERE d.id = ?`,
      [deliveryOrderId],
    );
    const target = rows[0];
    if (!target) return;

    const locale = resolveLocale(target.locale);
    const amount = Number(target.amount);
    const copy = getDeliveryNoticeCopy(event, locale, {
      tradeNo: target.merchant_trade_no,
      amount,
      reason,
    });
    const link = `/delivery/payment-result?MerchantTradeNo=${encodeURIComponent(target.merchant_trade_no)}`;

    try {
      await createNotification(getSocketBroadcaster(), {
        recipient_id: target.user_id,
        type: "ORDER_UPDATE",
        title: copy.title,
        content: copy.content,
        link,
      });
    } catch (notifyErr) {
      console.error(`[delivery-notice] In-app notification failed for #${deliveryOrderId}:`, notifyErr);
    }

    if (target.email) {
      await enqueueSendEmail({
        template: "delivery-notice",
        recipientId: target.user_id,
        event,
        reason,
        merchantTradeNo: target.merchant_trade_no,
        amount,
        ctaUrl: `${getAppOrigin()}${link}`,
      });
    }
  } catch (err) {
    console.error(`[delivery-notice] ${event} notice failed for #${deliveryOrderId}:`, err);
  }
}
