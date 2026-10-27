//* 通知 type 的單一來源
//* 新增帶 params 的 type 時，client 的 REQUIRED_PARAMS 與兩個語言檔的 Notifications.event 都要補上（client 的測試會檢查）
//* 這個檔案不可 import 任何東西，client 測試會直接讀它

//* 帶 params、由 client 依讀者語言組句（client/utils/notificationText.ts）
export const RENDERED_NOTIFICATION_TYPES = [
  "LIKE",
  "COMMENT",
  "COMMENT_REPLY",
  "WEAVE_REQUESTED",
  "WEAVE_APPROVED",
  "WEAVE_DECLINED",
  "WEAVE_WITHDRAWN",
  "WEAVE_CANCELLED",
  "WEAVE_CONFIRMED",
  "WEAVE_COMPLETED",
] as const;

//* 寫入時就組好 title / content、沒有 params
export const TEXT_NOTIFICATION_TYPES = ["ORDER_UPDATE", "SYSTEM"] as const;

export const NOTIFICATION_TYPES = [
  ...RENDERED_NOTIFICATION_TYPES,
  ...TEXT_NOTIFICATION_TYPES,
] as const;
