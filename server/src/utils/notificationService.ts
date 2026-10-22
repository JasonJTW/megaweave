import dbPool from "./db";
import { ResultSetHeader } from "mysql2";
import type { SocketBroadcaster } from "./socket";
import z from "zod";

//* 有 params 的 type 由 client 依讀者語言組句（client/utils/notificationText.ts）；
//* title / content 仍寫入英文，給 log 與沒有 params 的舊資料用
export const NotificationTypeSchema = z.enum([
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
  "ORDER_UPDATE",
  "SYSTEM",
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: z.number(),
  recipient_id: z.number(),
  sender_id: z.number().optional().nullable(),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(100),
  content: z.string().min(1),
  params: z.record(z.string(), z.string()).optional().nullable(),
  link: z.string().optional().nullable(),
  is_read: z.boolean().default(false),
  created_at: z.date(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const createNotification = async (
  io: SocketBroadcaster | null,
  data: Omit<Notification, "id" | "is_read" | "created_at">
) => {
  try {
    // 1. 存入 MySQL
    const [result] = await dbPool.query<ResultSetHeader>(
      `INSERT INTO notifications (recipient_id, sender_id, type, title, content, params, link)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.recipient_id,
        data.sender_id || null,
        data.type,
        data.title,
        data.content,
        data.params ? JSON.stringify(data.params) : null,
        data.link || null,
      ]
    );

    const newNotification = {
      id: result.insertId,
      ...data,
      is_read: false,
      created_at: new Date(),
    };

    // 2. 透過 Socket.io 實時推送（worker process 傳入的是 redis Emitter，經 API 的 adapter 轉送）
    // 記得你之前設定的 Room 名稱是 `user_${id}`
    io?.to(`user_${data.recipient_id}`).emit(
      "new_notification",
      newNotification
    );

    return newNotification;
  } catch (error) {
    console.error("Failed to create notification:", error);
    throw error;
  }
};
