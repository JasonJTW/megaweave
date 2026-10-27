// server/src/services/deliveryNoticeCopy.ts
// 外送訂單通知文案（站內通知與 Email 共用），來自 messages/ 翻譯檔的 DeliveryNotice namespace。

import { getTranslator } from "../utils/i18n";
import type { Locale } from "../validations";

export type DeliveryNoticeEvent =
  | "DISPATCH_FAILED" // 叫車失敗，將退款
  | "PAID_AFTER_ORDER_CLOSED" // 付款時外送單已逾期，將退款
  | "REFUNDED" // 退款完成
  | "REFUND_FAILED"; // 退款未完成，需人工處理

interface NoticeContext {
  tradeNo: string;
  amount: number;
  /** 退款原因（例如 LALAMOVE_EXPIRED），用於 REFUNDED 文案 */
  reason?: string;
}

export interface NoticeCopy {
  title: string;
  content: string;
}

export function getDeliveryNoticeCopy(
  event: DeliveryNoticeEvent,
  locale: Locale,
  { tradeNo, amount, reason }: NoticeContext,
): NoticeCopy {
  const t = getTranslator(locale, "DeliveryNotice");
  return {
    title: t(`${event}.title`),
    content: t(`${event}.content`, { tradeNo, amount, reason: reason ?? "none" }),
  };
}
