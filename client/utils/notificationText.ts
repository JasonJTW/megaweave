import type { useTranslations } from "next-intl";

export type NotificationsTranslator = ReturnType<
  typeof useTranslations<"Notifications">
>;

//* 每種 type 組句需要的 params（server/src/utils/notificationService.ts 寫入）
const REQUIRED_PARAMS = {
  LIKE: ["actorName", "postTitle"],
  COMMENT: ["actorName", "postTitle"],
  COMMENT_REPLY: ["actorName"],
  WEAVE_REQUESTED: ["actorName", "postTitle"],
  WEAVE_APPROVED: ["actorName", "postTitle"],
  WEAVE_DECLINED: ["actorName", "postTitle"],
  WEAVE_WITHDRAWN: ["actorName", "postTitle"],
  WEAVE_CANCELLED: ["actorName", "postTitle"],
  WEAVE_CONFIRMED: ["actorName", "postTitle"],
  WEAVE_COMPLETED: ["postTitle"],
} as const satisfies Record<string, readonly string[]>;

type EventType = keyof typeof REQUIRED_PARAMS;

export interface NotificationTextInput {
  type: string;
  params?: Record<string, unknown> | null;
  title: string;
  content: string;
}

//* 依 type + params 用讀者的語言組句；沒有 params 的舊通知（或資料不完整）照原本存的 title / content 顯示
export function notificationText(
  t: NotificationsTranslator,
  { type, params, title, content }: NotificationTextInput,
): { title: string; content: string } {
  const legacy = { title, content };
  if (!params || !Object.hasOwn(REQUIRED_PARAMS, type)) return legacy;

  const event = type as EventType;
  const values: Record<string, string> = {};
  for (const key of REQUIRED_PARAMS[event]) {
    const value = params[key];
    if (typeof value !== "string" || value === "") return legacy;
    values[key] = value;
  }

  return {
    title: t(`event.${event}.title`),
    content: t(`event.${event}.content`, values),
  };
}
