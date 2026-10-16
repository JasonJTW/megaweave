// server/src/services/deliveryNotifier.ts
// 外送訂單叫車失敗 / 退款結果通知：站內通知（DB + Socket.IO）+ Email（BullMQ），依使用者語系產生文案。
// 通知為盡力而為：任何失敗只記錄，不影響派單與退款流程。

import { RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { getSocketIO } from "../utils/socket";
import { createNotification } from "../utils/notificationService";
import { enqueueSendEmail } from "../queue/queues";

export type DeliveryNoticeEvent =
  | "DISPATCH_FAILED" // 叫車失敗，將退款
  | "PAID_AFTER_ORDER_CLOSED" // 付款時外送單已逾期，將退款
  | "REFUNDED" // 退款完成
  | "REFUND_FAILED"; // 退款未完成，需人工處理

type Locale = "zh-TW" | "en";

interface NoticeContext {
  tradeNo: string;
  amount: number;
  /** 退款原因（例如 LALAMOVE_EXPIRED），用於 REFUNDED 文案 */
  reason?: string;
}

interface NoticeCopy {
  title: string;
  content: string;
}

const REFUND_REASON_PREFIX: Record<Locale, Record<string, string>> = {
  "zh-TW": {
    LALAMOVE_EXPIRED: "由於沒有司機在時限內接單，",
    LALAMOVE_REJECTED: "由於 Lalamove 無法完成此趟外送，",
    PAID_AFTER_ORDER_CLOSED: "由於付款時外送訂單已逾期，",
  },
  en: {
    LALAMOVE_EXPIRED: "No driver accepted your delivery in time, so ",
    LALAMOVE_REJECTED: "Lalamove could not fulfil your delivery, so ",
    PAID_AFTER_ORDER_CLOSED: "Your payment arrived after the delivery order expired, so ",
  },
};

export function getDeliveryNoticeCopy(
  event: DeliveryNoticeEvent,
  locale: Locale,
  { tradeNo, amount, reason }: NoticeContext,
): NoticeCopy {
  const prefix = (reason && REFUND_REASON_PREFIX[locale][reason]) || "";

  if (locale === "en") {
    switch (event) {
      case "DISPATCH_FAILED":
        return {
          title: "Delivery booking failed — full refund on the way",
          content: `We're sorry, we couldn't book a Lalamove driver for order ${tradeNo}. Your payment of NT$${amount} will be refunded in full to your card. We'll let you know once it's done.`,
        };
      case "PAID_AFTER_ORDER_CLOSED":
        return {
          title: "Order expired before payment — full refund on the way",
          content: `Your payment for order ${tradeNo} arrived after the delivery order had expired, so no driver was booked. NT$${amount} will be refunded in full to your card. Please book the delivery again.`,
        };
      case "REFUNDED":
        return {
          title: "Delivery payment refunded",
          content: `${prefix}${prefix ? "your" : "Your"} payment of NT$${amount} for order ${tradeNo} has been refunded to your card. The exact posting date depends on your card issuer.`,
        };
      case "REFUND_FAILED":
        return {
          title: "Your refund is being processed",
          content: `We couldn't complete the refund of NT$${amount} for order ${tradeNo} automatically. Our support team has been notified and will contact you shortly.`,
        };
    }
  }

  switch (event) {
    case "DISPATCH_FAILED":
      return {
        title: "叫車失敗，將全額退款",
        content: `很抱歉，您的外送訂單（${tradeNo}）未能成功向 Lalamove 叫車。已支付的 NT$${amount} 將全額退回原信用卡，完成後會再通知您。`,
      };
    case "PAID_AFTER_ORDER_CLOSED":
      return {
        title: "付款時訂單已逾期，將全額退款",
        content: `您的外送訂單（${tradeNo}）在逾期後才完成付款，因此未能叫車。已支付的 NT$${amount} 將全額退回原信用卡，請重新叫車。`,
      };
    case "REFUNDED":
      return {
        title: "外送款項已全額退款",
        content: `${prefix}外送訂單（${tradeNo}）的 NT$${amount} 已退回原信用卡，實際入帳時間依發卡銀行而定。`,
      };
    case "REFUND_FAILED":
      return {
        title: "退款處理中",
        content: `外送訂單（${tradeNo}）的 NT$${amount} 退款暫時未能自動完成，我們已通知客服人員處理，將盡快與您聯繫。`,
      };
  }
}

export async function notifyDeliveryUser(
  deliveryOrderId: number,
  event: DeliveryNoticeEvent,
  reason?: string,
): Promise<void> {
  try {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT d.user_id, p.merchant_trade_no, p.amount, u.email, u.locale,
              COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username
       FROM delivery_orders d
       JOIN payments p ON p.id = d.payment_id
       JOIN users u ON u.id = d.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE d.id = ?`,
      [deliveryOrderId],
    );
    const target = rows[0];
    if (!target) return;

    const locale: Locale = target.locale === "en" ? "en" : "zh-TW";
    const amount = Number(target.amount);
    const copy = getDeliveryNoticeCopy(event, locale, {
      tradeNo: target.merchant_trade_no,
      amount,
      reason,
    });
    const link = `/delivery/payment-result?MerchantTradeNo=${encodeURIComponent(target.merchant_trade_no)}`;

    try {
      await createNotification(getSocketIO(), {
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
      const host = process.env.NEXT_PUBLIC_HOSTNAME || "https://megaweaving.net";
      await enqueueSendEmail({
        template: "delivery-notice",
        locale,
        username: target.username,
        toEmail: target.email,
        title: copy.title,
        description: copy.content,
        merchantTradeNo: target.merchant_trade_no,
        amount,
        ctaUrl: `${host}${link}`,
      });
    }
  } catch (err) {
    console.error(`[delivery-notice] ${event} notice failed for #${deliveryOrderId}:`, err);
  }
}
