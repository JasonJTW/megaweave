// server/src/utils/weaveService.ts
// 深層模組：封裝所有 Weave 業務邏輯（驗證、DB、通知、Socket）
// 對外介面：requestWeave() 和 approveWeave()

import { RowDataPacket, ResultSetHeader } from "mysql2";
import { Server } from "socket.io";
import dbPool from "./db";
import { createNotification } from "./notificationService";
import { messageService } from "./messageService";
import { updateUserStats } from "./updateUserStats";

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

  // Notification
  let notificationSent = false;
  if (io) {
    try {
      const [postInfo] = await dbPool.execute<RowDataPacket[]>(
        "SELECT title FROM posts WHERE id = ?",
        [postId],
      );
      const postTitle = (postInfo[0]?.title as string) ?? "Item";
      await createNotification(io, {
        recipient_id: targetUserId,
        sender_id: initiator.id,
        type: "ORDER_UPDATE",
        title: isWish ? "New Share Offer" : "New Wish Request",
        content: isWish
          ? `${initiator.name} wants to share "${postTitle}" with you!`
          : `${initiator.name} is wishing for your "${postTitle}"`,
        link: `/user?highlightWeaveId=${weaveId}`,
      });
      notificationSent = true;
    } catch (e) {
      console.error("🔔 [requestWeave] Notification failed:", e);
    }
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
          if (io) {
            try {
              const recipientId = isGiver ? weave.receiver_id : weave.giver_id;
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
          return { newStatus: "pending", fullyCompleted: false };
        }
      } else {
        throw new WeaveError(400, "Invalid status transition");
      }
    }

    await connection.commit();

    // ── Post-commit: notification + socket broadcast ───────────────────────────
    if (io) {
      try {
        const [details] = await dbPool.execute<RowDataPacket[]>(
          `SELECT p.title FROM posts p WHERE p.id = ?`,
          [weave.post_id],
        );
        const postTitle = (details[0]?.title as string) ?? "Item";
        const recipientId = isGiver ? weave.receiver_id : weave.giver_id;

        // Pick notification copy
        let notifTitle = "";
        let notifContent = "";

        if (newStatus === "pending" && weave.status === "requested") {
          notifTitle = "Weave Request Approved";
          notifContent = `${actorName} approved your weave request for "${postTitle}"`;
        } else if (newStatus === "rejected") {
          notifTitle = "Weave Request Declined";
          notifContent = `${actorName} declined your weave request for "${postTitle}"`;
        } else if (newStatus === "cancelled") {
          notifTitle = "Weave Cancelled";
          notifContent = `${actorName} cancelled the weave for "${postTitle}"`;
        } else if (newStatus === "completed") {
          // Check actual DB status to distinguish full vs partial completion
          const [statusCheck] = await dbPool.execute<RowDataPacket[]>(
            `SELECT status FROM weaves WHERE id = ?`,
            [weaveId],
          );
          if ((statusCheck[0]?.status as string) === "completed") {
            notifTitle = "Weave Completed";
            notifContent = `Weave for "${postTitle}" is successfully completed!`;
          } else {
            notifTitle = "Weave Confirmed";
            notifContent = `${actorName} confirmed the weave for "${postTitle}". Waiting for your confirmation.`;
          }
        }

        if (notifTitle) {
          await createNotification(io, {
            recipient_id: recipientId,
            sender_id: userId,
            type: "ORDER_UPDATE",
            title: notifTitle,
            content: notifContent,
            link: `/user?highlightWeaveId=${weaveId}`,
          });
        }

        // Broadcast real-time status update to both parties
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
      } catch (e) {
        console.error("Weave update notification failed:", e);
      }
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
