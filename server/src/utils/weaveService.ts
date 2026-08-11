// server/src/utils/weaveService.ts
// 深層模組：封裝所有 Weave 業務邏輯（驗證、DB、通知、Socket）
// 對外介面：requestWeave() 和 approveWeave()

import { RowDataPacket, ResultSetHeader } from "mysql2";
import { Server } from "socket.io";
import dbPool from "./db";
import { createNotification } from "./notificationService";
import { messageService } from "./messageService";
import { updateUserStats } from "./updateUserStats";
import { enqueueSendEmail } from "../queue/queues";
import { EmailTemplateProps, WeaveItem } from "../emails/EmailTemplate";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class WeaveError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "WeaveError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeaveStatus =
  | "pending"
  | "requested"
  | "rejected"
  | "cancelled"
  | "completed";

export interface RequestWeaveParams {
  postId: number;
  /** Normalised items. Pass [] when no specific items requested. */
  items: Array<{ itemId: number | null; quantity: number }>;
  notes?: string | null;
  initiator: {
    id: number;
    name: string;
    publicId: string;
  };
}

export interface RequestWeaveResult {
  weaveId: number;
  notificationSent: boolean;
}

export interface ApproveWeaveParams {
  weaveId: string;
  newStatus: WeaveStatus;
  userId: number;
  actorName: string;
}

export interface ApproveWeaveResult {
  newStatus: string;
  fullyCompleted: boolean;
}

interface WeaveRow extends RowDataPacket {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  status: WeaveStatus;
  giver_confirmed: boolean | number;
  receiver_confirmed: boolean | number;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function validatePost(
  postId: number,
  initiatorId: number,
): Promise<{ user_id: number; status: string; type: string }> {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT user_id, status, type FROM posts WHERE id = ?`,
    [postId],
  );
  if (rows.length === 0) throw new WeaveError(404, "Post not found");
  if (rows[0].user_id === initiatorId)
    throw new WeaveError(400, "Cannot weave your own post");
  if (rows[0].status !== "active")
    throw new WeaveError(400, "This post is no longer active");
  return rows[0] as { user_id: number; status: string; type: string };
}

async function validateItems(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
): Promise<void> {
  for (const item of items) {
    if (!item.itemId) continue;
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT quantity, title FROM items WHERE id = ? AND post_id = ?`,
      [item.itemId, postId],
    );
    if (rows.length === 0)
      throw new WeaveError(
        404,
        `Item ${item.itemId} does not exist in this post`,
      );
    if (rows[0].quantity < item.quantity)
      throw new WeaveError(
        400,
        `Requested quantity (${item.quantity}) exceeds available stock (${rows[0].quantity}) for "${rows[0].title}"`,
      );
  }
}

async function buildSystemMessageMeta(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
  weaveId: number,
  postType: string,
  postOwnerId: number,
) {
  const first = items[0];
  let itemTitle = "All Items";

  if (first?.itemId) {
    const [itemRows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT title FROM items WHERE id = ?`,
      [first.itemId],
    );
    if (itemRows.length > 0) {
      itemTitle = itemRows[0].title as string;
      if (items.length > 1) itemTitle += ` +${items.length - 1} more`;
    }
  } else {
    const [postRows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT title FROM posts WHERE id = ?`,
      [postId],
    );
    if (postRows.length > 0)
      itemTitle = `All Items - ${postRows[0].title as string}`;
  }

  const [imgRows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT s3_key FROM images WHERE post_id = ? ORDER BY id ASC LIMIT 1`,
    [postId],
  );
  const imageS3Key = imgRows.length > 0 ? (imgRows[0].s3_key as string) : null;
  const postAuthorPublicId =
    await messageService.getPublicIdByUserId(postOwnerId);

  return {
    item_id: first?.itemId ?? null,
    item_title: itemTitle,
    quantity: first?.quantity ?? 1,
    weave_id: weaveId,
    post_id: postId,
    image_s3_key: imageS3Key,
    post_type: postType,
    post_author_public_id: postAuthorPublicId,
  };
}

// ─── Notification & Email Helpers ─────────────────────────────────────────────

export type WeaveActionType =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "confirmed"
  | "completed";

interface WeaveNoticeCopy {
  title: string;
  content: string;
}

/**
 * 根據 Weave 動作事件 (Action) 統一生成通知與 Email 標題與內容
 */
function getWeaveNoticeCopy(
  action: WeaveActionType,
  actorName: string,
  postTitle: string,
): WeaveNoticeCopy | null {
  switch (action) {
    case "requested":
      return {
        title: "New Weave Request",
        content: `${actorName} sent a weave request for "${postTitle}"`,
      };
    case "approved":
      return {
        title: "Weave Request Approved",
        content: `${actorName} approved your weave request for "${postTitle}"`,
      };
    case "declined":
      return {
        title: "Weave Request Declined",
        content: `${actorName} declined your weave request for "${postTitle}"`,
      };
    case "cancelled":
      return {
        title: "Weave Cancelled",
        content: `${actorName} cancelled the weave for "${postTitle}"`,
      };
    case "confirmed":
      return {
        title: "Weave Confirmed",
        content: `${actorName} confirmed the weave for "${postTitle}". Waiting for your confirmation.`,
      };
    case "completed":
      return {
        title: "Weave Completed",
        content: `Weave for "${postTitle}" is successfully completed!`,
      };
    default:
      return null;
  }
}

async function getWeaveItemsList(
  weaveId: number,
  _postId: number,
): Promise<WeaveItem[]> {
  const [weaveItems] = await dbPool.execute<RowDataPacket[]>(
    `SELECT item_id, quantity FROM weave_items WHERE weave_id = ?`,
    [weaveId],
  );

  const result: WeaveItem[] = [];

  for (const item of weaveItems) {
    if (item.item_id === null) {
      // All-items weave — no specific item selected
      result.push({ title: "All items", quantity: null });
    } else {
      const qty: number = item.quantity ?? 1;
      const [itemRows] = await dbPool.execute<RowDataPacket[]>(
        `SELECT title FROM items WHERE id = ?`,
        [item.item_id],
      );
      if (itemRows.length > 0) {
        result.push({ title: itemRows[0].title as string, quantity: qty });
      }
    }
  }

  return result;
}

interface NotifyWeaveStatusParams {
  io: Server | null;
  weaveId: number;
  recipientId: number;
  senderId: number;
  actorName: string;
  postTitle: string;
  action: WeaveActionType;
  items: WeaveItem[];
  isRecipientGiver: boolean;
}

/**
 * 統一派發站內通知 (Socket + DB) 與 站外 Email (BullMQ Queue)
 */
async function notifyWeaveStatusChange(params: NotifyWeaveStatusParams) {
  const {
    io,
    weaveId,
    recipientId,
    senderId,
    actorName,
    postTitle,
    action,
    items,
    isRecipientGiver,
  } = params;

  const copy = getWeaveNoticeCopy(action, actorName, postTitle);
  if (!copy) return;

  const link = `/user?highlightWeaveId=${weaveId}`;

  // 1. 站內通知 (Socket + DB)
  if (io) {
    createNotification(io, {
      recipient_id: recipientId,
      sender_id: senderId,
      type: "ORDER_UPDATE",
      title: copy.title,
      content: copy.content,
      link,
    }).catch((e) => console.error("🔔 Notification creation failed:", e));
  }

  // 2. 站外 Email (Queue)
  try {
    const [userRows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT username, email FROM users WHERE id = ?",
      [recipientId],
    );

    if (userRows.length > 0 && userRows[0].email) {
      const recipient = userRows[0];
      const host =
        process.env.NEXT_PUBLIC_HOSTNAME || "https://megaweaving.net";

      // 映射 action 至 Email 的 weaving_status 呈現
      const emailStatusMap: Record<WeaveActionType, WeaveStatus> = {
        requested: "requested",
        approved: "pending",
        declined: "rejected",
        cancelled: "cancelled",
        confirmed: "pending",
        completed: "completed",
      };

      const emailProps: EmailTemplateProps = {
        username: recipient.username,
        toEmail: recipient.email,
        title: copy.title,
        description: copy.content,
        weaveId: `#TXN-${weaveId}`,
        weaving_status: emailStatusMap[action],
        itemsOffered: isRecipientGiver ? items : undefined,
        itemsReceived: isRecipientGiver ? undefined : items,
        ctaUrl: `${host}${link}`,
      };

      await enqueueSendEmail(emailProps);
    }
  } catch (e) {
    console.error("📧 Enqueue email failed:", e);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 建立 Weave 請求：驗證 → 寫入 DB → 發通知 → 建立對話系統訊息
 */
export async function requestWeave(
  params: RequestWeaveParams,
  io: Server | null,
): Promise<RequestWeaveResult> {
  const { postId, items, notes, initiator } = params;

  const post = await validatePost(postId, initiator.id);
  await validateItems(items, postId);

  const { user_id: postOwnerId, type: postType } = post;
  const isWish = postType === "wish";
  const giverId = isWish ? initiator.id : postOwnerId;
  const receiverId = isWish ? postOwnerId : initiator.id;
  const targetUserId = initiator.id === giverId ? receiverId : giverId;

  // Get conversationId first to store in weaves table
  let conversationId: number | null = null;
  try {
    conversationId = await messageService.getConversationId(
      initiator.id,
      targetUserId,
    );
  } catch (e) {
    console.error("[requestWeave] Failed to get conversationId:", e);
  }

  // Write weave + items
  const [result] = await dbPool.execute<ResultSetHeader>(
    `INSERT INTO weaves (post_id, giver_id, receiver_id, conversation_id, status, notes)
     VALUES (?, ?, ?, ?, 'requested', ?)`,
    [postId, giverId, receiverId, conversationId, notes ?? null],
  );
  const weaveId = result.insertId;

  for (const item of items) {
    await dbPool.execute(
      `INSERT INTO weave_items (weave_id, item_id, quantity) VALUES (?, ?, ?)`,
      [weaveId, item.itemId ?? null, item.quantity],
    );
  }

  // Notification & Email
  let notificationSent = false;
  try {
    const [postInfo] = await dbPool.execute<RowDataPacket[]>(
      "SELECT title FROM posts WHERE id = ?",
      [postId],
    );
    const postTitle = (postInfo[0]?.title as string) ?? "Item";
    const items = await getWeaveItemsList(Number(weaveId), postId);

    await notifyWeaveStatusChange({
      io,
      weaveId: Number(weaveId),
      recipientId: targetUserId,
      senderId: initiator.id,
      actorName: initiator.name,
      postTitle,
      action: "requested",
      items,
      isRecipientGiver: targetUserId === giverId,
    });
    notificationSent = true;
  } catch (e) {
    console.error("🔔 [requestWeave] Notification/Email failed:", e);
  }

  // System message in conversation
  if (conversationId) {
    try {
      const meta = await buildSystemMessageMeta(
        items,
        postId,
        weaveId,
        postType,
        postOwnerId,
      );
      const sysMsg = await messageService.createMessage(
        conversationId,
        initiator.id,
        "Start Weaving",
        undefined,
        "system_start_weaving",
        meta,
      );
      if (io) {
        const dto = messageService.toMessageDTO(sysMsg, initiator.publicId);
        const payload = { ...dto, conversation_id: conversationId };
        io.to(`user_${targetUserId}`).emit("new_message", payload);
        io.to(`user_${initiator.id}`).emit("new_message", payload);
      }
    } catch (e) {
      console.error("[requestWeave] System message failed:", e);
    }
  }

  return { weaveId, notificationSent };
}

/**
 * 審核 / 確認 / 取消 Weave：狀態機 → 扣庫存 → 通知 → Socket 廣播
 */
export async function approveWeave(
  params: ApproveWeaveParams,
  io: Server | null,
): Promise<ApproveWeaveResult> {
  const { weaveId, newStatus, userId, actorName } = params;
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    const [weaves] = await connection.execute<WeaveRow[]>(
      `SELECT * FROM weaves WHERE id = ? FOR UPDATE`,
      [weaveId],
    );
    if (weaves.length === 0) throw new WeaveError(404, "Not found");

    const weave = weaves[0];
    if (weave.status !== "requested" && weave.status !== "pending")
      throw new WeaveError(400, "Already closed");

    const isGiver = weave.giver_id === userId;
    const isReceiver = weave.receiver_id === userId;
    if (!isGiver && !isReceiver) throw new WeaveError(403, "Unauthorized");

    // ── State machine ─────────────────────────────────────────────────────────
    if (weave.status === "requested") {
      if (newStatus === "pending") {
        if (!isGiver) throw new WeaveError(403, "Only giver can approve");
        await connection.execute(
          `UPDATE weaves SET status = 'pending' WHERE id = ?`,
          [weaveId],
        );
      } else if (newStatus === "rejected") {
        if (!isGiver) throw new WeaveError(403, "Only giver can reject");
        await connection.execute(
          `UPDATE weaves SET status = 'rejected' WHERE id = ?`,
          [weaveId],
        );
      } else if (newStatus === "cancelled") {
        await connection.execute(
          `UPDATE weaves SET status = 'cancelled' WHERE id = ?`,
          [weaveId],
        );
      } else {
        throw new WeaveError(400, "Invalid status transition");
      }
    } else if (weave.status === "pending") {
      if (newStatus === "cancelled") {
        await connection.execute(
          `UPDATE weaves SET status = 'cancelled' WHERE id = ?`,
          [weaveId],
        );
      } else if (newStatus === "completed") {
        const confirmField = isGiver ? "giver_confirmed" : "receiver_confirmed";
        await connection.execute(
          `UPDATE weaves SET ${confirmField} = 1 WHERE id = ?`,
          [weaveId],
        );
        const [check] = await connection.execute<WeaveRow[]>(
          `SELECT giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
          [weaveId],
        );

        const bothConfirmed =
          Boolean(check[0].giver_confirmed) &&
          Boolean(check[0].receiver_confirmed);

        if (bothConfirmed) {
          // Deduct inventory
          const [weaveItems] = await connection.execute<RowDataPacket[]>(
            `SELECT item_id, quantity FROM weave_items WHERE weave_id = ? AND item_id IS NOT NULL`,
            [weaveId],
          );
          for (const item of weaveItems) {
            await connection.execute(
              `UPDATE items SET quantity = quantity - ? WHERE id = ?`,
              [item.quantity, item.item_id],
            );
          }
          await connection.execute(
            `UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?`,
            [weaveId],
          );
        } else {
          // Partial confirm: commit early, broadcast partial state, return
          await connection.commit();
          const recipientId = isGiver ? weave.receiver_id : weave.giver_id;
          if (io) {
            try {
              const [latestRows] = await dbPool.execute<RowDataPacket[]>(
                `SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
                [weaveId],
              );
              io.to(`user_${recipientId}`).emit("weave_status_updated", {
                weaveId: Number(weaveId),
                status: (latestRows[0]?.status as string) || "pending",
                giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
                receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
              });
              io.to(`user_${userId}`).emit("weave_status_updated", {
                weaveId: Number(weaveId),
                status: (latestRows[0]?.status as string) || "pending",
                giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
                receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
              });
            } catch (emitErr) {
              console.error("Socket emit failed on partial confirm:", emitErr);
            }
          }

          // 派發單邊確認的通知與 Email
          const [details] = await dbPool.execute<RowDataPacket[]>(
            `SELECT p.title FROM posts p WHERE p.id = ?`,
            [weave.post_id],
          );
          const postTitle = (details[0]?.title as string) ?? "Item";
          const items = await getWeaveItemsList(Number(weaveId), weave.post_id);

          notifyWeaveStatusChange({
            io,
            weaveId: Number(weaveId),
            recipientId,
            senderId: userId,
            actorName,
            postTitle,
            action: "confirmed",
            items,
            isRecipientGiver: recipientId === weave.giver_id,
          }).catch((err) =>
            console.error("Notification/Email failed on partial confirm:", err),
          );

          return { newStatus: "pending", fullyCompleted: false };
        }
      } else {
        throw new WeaveError(400, "Invalid status transition");
      }
    }

    await connection.commit();

    // ── Post-commit: notification + socket broadcast ───────────────────────────
    try {
      const [details] = await dbPool.execute<RowDataPacket[]>(
        `SELECT p.title FROM posts p WHERE p.id = ?`,
        [weave.post_id],
      );
      const postTitle = (details[0]?.title as string) ?? "Item";
      const recipientId = isGiver ? weave.receiver_id : weave.giver_id;
      const items = await getWeaveItemsList(Number(weaveId), weave.post_id);

      // 判斷觸發的 Action 類型
      let action: WeaveActionType | null = null;
      if (newStatus === "pending" && weave.status === "requested") {
        action = "approved";
      } else if (newStatus === "rejected") {
        action = "declined";
      } else if (newStatus === "cancelled") {
        action = "cancelled";
      } else if (newStatus === "completed") {
        const [statusCheck] = await dbPool.execute<RowDataPacket[]>(
          `SELECT status FROM weaves WHERE id = ?`,
          [weaveId],
        );
        action =
          (statusCheck[0]?.status as string) === "completed"
            ? "completed"
            : "confirmed";
      }

      // 派發通知與 Email
      if (action) {
        // 1. 寄給對方 (Recipient)
        await notifyWeaveStatusChange({
          io,
          weaveId: Number(weaveId),
          recipientId,
          senderId: userId,
          actorName,
          postTitle,
          action,
          items,
          isRecipientGiver: recipientId === weave.giver_id,
        });

        // 2. 如果狀態為「完全完成 (completed)」，觸發動作的這一方 (userId) 也必須收到 Completed 通知與 Email
        if (action === "completed") {
          await notifyWeaveStatusChange({
            io,
            weaveId: Number(weaveId),
            recipientId: userId,
            senderId: userId,
            actorName,
            postTitle,
            action: "completed",
            items,
            isRecipientGiver: userId === weave.giver_id,
          });
        }
      }

      // Broadcast real-time status update to both parties via Socket
      if (io) {
        const [latestRows] = await dbPool.execute<RowDataPacket[]>(
          `SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
          [weaveId],
        );
        const statusPayload = {
          weaveId: Number(weaveId),
          status: (latestRows[0]?.status as string) || newStatus,
          giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
          receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
        };
        io.to(`user_${recipientId}`).emit(
          "weave_status_updated",
          statusPayload,
        );
        io.to(`user_${userId}`).emit("weave_status_updated", statusPayload);
      }
    } catch (e) {
      console.error("Weave update notification/socket failed:", e);
    }

    // Async stats recalculation (fire-and-forget)
    if (newStatus === "completed") {
      updateUserStats(weave.giver_id.toString()).catch(console.error);
      updateUserStats(weave.receiver_id.toString()).catch(console.error);
    }

    return { newStatus, fullyCompleted: newStatus === "completed" };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
