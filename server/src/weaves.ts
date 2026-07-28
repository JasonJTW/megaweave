import Router, { Request, Response } from "express";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { updateUserStats } from "./utils/updateUserStats";
import { createNotification } from "./utils/notificationService";
import { messageService } from "./utils/messageService";

const router = Router();

// 1. 定義型別
interface WeaveRow extends RowDataPacket {
  id: number;
  post_id: number;
  item_id: number | null;
  giver_id: number;
  receiver_id: number;
  quantity: number;
  status: "pending" | "completed" | "cancelled";
  giver_confirmed: boolean | number;
  receiver_confirmed: boolean | number;
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface WeaveOutput extends RowDataPacket {
  id: number;
  post_id: number;
  item_id: number | null;
  giver_id: number;
  receiver_id: number;
  quantity: number;
  status: "pending" | "completed" | "cancelled";
  giver_confirmed: number;
  receiver_confirmed: number;
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  post_id_original: number;
  post_user_id: number;
  post_title: string;
  post_content: string;
  post_type: "wish" | "share" | "commons";
  post_status_original: "active" | "inactive" | "expired";
  post_location: string | null;
  post_tags: string | null;
  post_category_id: number;
  post_condition_level: number;
  post_expires_at: Date | null;
  post_view_count: number;
  post_likes_count: number;
  post_created_at: Date;
  post_updated_at: Date;
  post_comment_count: number;
  item_title: string | null;
  giver_name: string;
  giver_avatar: string;
  receiver_name: string;
  receiver_avatar: string;
  image_urls: string;
}

interface ItemRow extends RowDataPacket {
  id: number;
  quantity: number;
  title: string;
}

// 2. 共用函數與 SQL
function processWeaveRows(weaveRows: WeaveOutput[]) {
  return weaveRows.map((row) => {
    const post = {
      id: row.post_id_original,
      user_id: row.post_user_id,
      title: row.post_title,
      content: row.post_content,
      type: row.post_type,
      status: row.post_status_original,
      location: row.post_location,
      tags: row.post_tags,
      category_id: row.post_category_id,
      condition_level: row.post_condition_level,
      expires_at: row.post_expires_at,
      view_count: row.post_view_count,
      likes_count: row.post_likes_count,
      created_at: row.post_created_at,
      updated_at: row.post_updated_at,
      comment_count: row.post_comment_count,
      image_urls: row.image_urls ? row.image_urls.split(",") : [],
    };

    return {
      id: row.id,
      post_id: row.post_id,
      item_id: row.item_id,
      giver_id: row.giver_id,
      receiver_id: row.receiver_id,
      quantity: row.quantity,
      status: row.status,
      notes: row.notes,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      item_title: row.item_title,
      giver_name: row.giver_name,
      giver_avatar: row.giver_avatar,
      receiver_name: row.receiver_name,
      receiver_avatar: row.receiver_avatar,
      giver_confirmed: Boolean(row.giver_confirmed),
      receiver_confirmed: Boolean(row.receiver_confirmed),
      post: post,
    };
  });
}

const WEAVE_QUERY_BASE = `
  SELECT 
      w.*,
      p.id AS post_id_original,
      p.user_id AS post_user_id,
      p.title AS post_title,
      p.content AS post_content,
      p.type AS post_type,
      p.status AS post_status_original,
      l.full_address AS post_location, 
      p.tags AS post_tags,
      p.category_id AS post_category_id,
      p.condition_level AS post_condition_level,
      p.expires_at AS post_expires_at,
      p.view_count AS post_view_count,
      p.likes_count AS post_likes_count,
      p.created_at AS post_created_at,
      p.updated_at AS post_updated_at,
      p.comment_count AS post_comment_count,
      i.title AS item_title,
      giver.username AS giver_name,
      giver.avatar_url AS giver_avatar,
      receiver.username AS receiver_name,
      receiver.avatar_url AS receiver_avatar,
      GROUP_CONCAT(img.image_url) AS image_urls
  FROM weaves w
  JOIN posts p ON w.post_id = p.id
  LEFT JOIN locations l ON p.location_id = l.id
  LEFT JOIN items i ON w.item_id = i.id
  JOIN users giver ON w.giver_id = giver.id
  JOIN users receiver ON w.receiver_id = receiver.id
  LEFT JOIN images img ON p.id = img.post_id
`;

// 3. 路由定義

// ✅ [補回] POST / - 索取物品
// ✅ 完整版：POST /api/weaves - 建立交易請求
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { postId, itemId, quantity = 1, notes } = req.body;

    if (!postId) {
      return res.status(400).json({ errorMessage: "Post ID is required" });
    }

    // 1. 檢查 Post 是否存在
    const [posts] = await dbPool.execute<RowDataPacket[]>(
      `SELECT user_id, status, type FROM posts WHERE id = ?`,
      [postId]
    );

    if (posts.length === 0) {
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    const postOwnerId = posts[0].user_id;
    const postType = posts[0].type;
    const initiatorId = Number(req.user!.userId);

    let giverId: number;
    let receiverId: number;

    // 根據 Post Type 決定誰是 Giver / Receiver
    if (postType === "wish") {
      // 如果是 Wish (許願)，發起交易的人 (Initiator) 是給予者 (Giver)，貼文者 (Post Owner) 是接收者 (Receiver)
      giverId = initiatorId;
      receiverId = postOwnerId;
    } else {
      // 如果是 Share / Commons，貼文者 (Post Owner) 是給予者 (Giver)，發起交易的人 (Initiator) 是接收者 (Receiver)
      giverId = postOwnerId;
      receiverId = initiatorId;
    }

    // 安全檢查：不能索取/贈送自己的物品 (雖然邏輯上 giverId/receiverId 不會同，但 initiatorId == postOwnerId 還是要擋)
    if (postOwnerId === initiatorId) {
      return res
        .status(400)
        .json({ errorMessage: "Cannot weave your own post" });
    }

    // 狀態檢查：只有 Active 的貼文可以交易
    if (posts[0].status !== "active") {
      return res
        .status(400)
        .json({ errorMessage: "This post is no longer active" });
    }

    // 2. 🔥 重要：處理指定 Item 的邏輯
    if (itemId) {
      // 檢查該 Item 是否真的屬於這則貼文，且庫存是否足夠
      const [items] = await dbPool.execute<RowDataPacket[]>(
        `SELECT quantity, title FROM items WHERE id = ? AND post_id = ?`,
        [itemId, postId]
      );

      if (items.length === 0) {
        return res
          .status(404)
          .json({ errorMessage: "Selected item does not exist in this post" });
      }

      if (items[0].quantity < quantity) {
        return res.status(400).json({
          errorMessage: `Requested quantity (${quantity}) exceeds available stock (${items[0].quantity})`,
        });
      }
    }

    // 3. 建立 Weave 紀錄 (預設狀態為 pending)
    const [result] = await dbPool.execute<ResultSetHeader>(
      `INSERT INTO weaves (post_id, item_id, giver_id, receiver_id, quantity, status, notes)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        postId,
        itemId || null, // 如果沒指定 item，存為 null
        giverId,
        receiverId,
        quantity,
        notes || null,
      ]
    );

    const targetUserId = initiatorId === giverId ? receiverId : giverId;
    let notificationSent = false;
    let debugInfo = {};

    // Notification Logic
    try {
      console.log("🔔 [Weave] Starting notification logic...");
      console.log(
        `🔔 [Weave] Initiator: ${initiatorId}, Giver: ${giverId}, Receiver: ${receiverId}`
      );
      console.log(
        `🔔 [Weave] Target User ID: ${targetUserId} (Type: ${typeof targetUserId})`
      );

      const io = res.locals.io;
      console.log(`🔔 [Weave] Socket.IO instance found: ${!!io}`);

      if (io) {
        const [postInfo] = await dbPool.execute<RowDataPacket[]>(
          "SELECT title, type FROM posts WHERE id = ?",
          [postId]
        );

        const postTitle = postInfo[0]?.title || "Item";
        const postType = postInfo[0]?.type;
        const initiatorName = req.user?.username || "Someone";

        let notifTitle = "New Weave Request";
        let notifContent = `${initiatorName} sent a weave request for "${postTitle}"`;

        if (postType === "wish") {
          notifTitle = "New Share Offer";
          notifContent = `${initiatorName} wants to share "${postTitle}" with you!`;
        } else {
          notifTitle = "New Wish Request";
          notifContent = `${initiatorName} is wishing for your "${postTitle}"`;
        }

        console.log(
          `🔔 [Weave] Creating notification: ${notifTitle} for User ${targetUserId}`
        );

        const notif = await createNotification(io, {
          recipient_id: targetUserId,
          sender_id: initiatorId,
          type: "ORDER_UPDATE",
          title: notifTitle,
          content: notifContent,
          link: `/user?highlightWeaveId=${result.insertId}`,
        });

        console.log("🔔 [Weave] Notification created successfully:", notif.id);
        notificationSent = true;
        debugInfo = { targetUserId, notif };
      } else {
        console.error("🔔 [Weave] Socket.IO instance MISSING");
      }
    } catch (e) {
      console.error("🔔 [Weave] Notification failed with error:", e);
      debugInfo = { error: String(e) };
    }

    // 建立聊天室對話的 System Message
    try {
      const conversationId = await messageService.getConversationId(initiatorId, targetUserId);
      
      // 取得 item 標題，如果沒有 itemId，標題可以使用 post 的標題
      let itemTitle = "All Items";
      if (itemId) {
        const [itemRows] = await dbPool.execute<RowDataPacket[]>(
          `SELECT title FROM items WHERE id = ?`,
          [itemId]
        );
        if (itemRows.length > 0) {
          itemTitle = itemRows[0].title;
        }
      } else {
        const [postRows] = await dbPool.execute<RowDataPacket[]>(
          `SELECT title FROM posts WHERE id = ?`,
          [postId]
        );
        if (postRows.length > 0) {
          itemTitle = `All Items - ${postRows[0].title}`;
        }
      }

      // 取得貼文的第一張圖片（只存 S3 key，避免寫死 CDN 網域）
      let imageS3Key: string | null = null;
      const [imgRows] = await dbPool.execute<RowDataPacket[]>(
        `SELECT s3_key FROM images WHERE post_id = ? ORDER BY id ASC LIMIT 1`,
        [postId]
      );
      if (imgRows.length > 0) {
        imageS3Key = imgRows[0].s3_key;
      }

      const postAuthorPublicId = await messageService.getPublicIdByUserId(postOwnerId);
      const newMetadata = { item_id: itemId, item_title: itemTitle, quantity, weave_id: result.insertId, post_id: postId, image_s3_key: imageS3Key, post_type: postType, post_author_public_id: postAuthorPublicId };

      const io = res.locals.io;
      const senderPublicId = req.user!.public_id;

      // 每次 Request 都新增一筆全新的 system_start_weaving 訊息（作為小卡）
      const sysMsg = await messageService.createMessage(
        conversationId,
        initiatorId,
        "Start Weaving",
        undefined,
        "system_start_weaving",
        newMetadata
      );

      if (io) {
        const sysMsgDTO = messageService.toMessageDTO(sysMsg, senderPublicId);
        const sysPayload = { ...sysMsgDTO, conversation_id: conversationId };
        io.to(`user_${targetUserId}`).emit("new_message", sysPayload);
        io.to(`user_${initiatorId}`).emit("new_message", sysPayload);
      }
    } catch (msgErr) {
      console.error("Failed to create weave system message:", msgErr);
    }

    return res.status(201).json({
      message: "Weave request sent successfully",
      weaveId: result.insertId,
      notificationSent,
      debugInfo,
    });
  } catch (error) {
    console.error("Error creating weave:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// GET / - 獲取我的交易列表
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { role } = req.query;
    let whereClause = `WHERE (w.giver_id = ? OR w.receiver_id = ?)`;
    const params: (string | number)[] = [userId, userId];

    if (role === "giver") {
      whereClause = `WHERE w.giver_id = ?`;
      params.splice(0, 2, userId);
    } else if (role === "receiver") {
      whereClause = `WHERE w.receiver_id = ?`;
      params.splice(0, 2, userId);
    }

    const query = `${WEAVE_QUERY_BASE} ${whereClause} GROUP BY w.id ORDER BY w.created_at DESC`;
    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, params);
    return res.status(200).json({ weaves: processWeaveRows(weaveRows) });
  } catch (error) {
    console.error("Error retrieving weaves:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    return res.status(500).json({ errorMessage: "Failed to retrieve weaves" });
  }
});

// PATCH /:id/status - 更新狀態 (新版雙向確認)
router.patch(
  "/:id/status",
  requireAuth,
  async (req: Request, res: Response) => {
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();
      const weaveId = req.params.id;
      const { status } = req.body;
      const userId = Number(req.user!.userId);

      const [weaves] = await connection.execute<WeaveRow[]>(
        `SELECT * FROM weaves WHERE id = ? FOR UPDATE`,
        [weaveId]
      );

      if (weaves.length === 0) {
        await connection.rollback();
        return res.status(404).json({ errorMessage: "Not found" });
      }
      const weave = weaves[0];
      if (weave.status !== "pending") {
        await connection.rollback();
        return res.status(400).json({ errorMessage: "Already closed" });
      }

      if (status === "cancelled") {
        await connection.execute(
          `UPDATE weaves SET status = 'cancelled' WHERE id = ?`,
          [weaveId]
        );
      } else if (status === "completed") {
        const isGiver = weave.giver_id === userId;
        const isReceiver = weave.receiver_id === userId;
        if (!isGiver && !isReceiver) throw new Error("Unauthorized");

        const confirmField = isGiver ? "giver_confirmed" : "receiver_confirmed";
        await connection.execute(
          `UPDATE weaves SET ${confirmField} = 1 WHERE id = ?`,
          [weaveId]
        );

        const [check] = await connection.execute<WeaveRow[]>(
          `SELECT giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
          [weaveId]
        );

        if (
          Boolean(check[0].giver_confirmed) &&
          Boolean(check[0].receiver_confirmed)
        ) {
          if (weave.item_id) {
            await connection.execute(
              `UPDATE items SET quantity = quantity - ? WHERE id = ?`,
              [weave.quantity, weave.item_id]
            );
          }
          await connection.execute(
            `UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?`,
            [weaveId]
          );
        } else {
          await connection.commit();
          return res.status(200).json({
            message: "Waiting",
            newStatus: "pending",
            fullyCompleted: false,
          });
        }
      }

      await connection.commit();

      // Notification Logic for Status Update
      try {
        const io = res.locals.io;
        if (io) {
          // Need to get details: Post Title, Other Party ID
          // We have 'weave' object but it doesn't have post title.
          // We need to fetch details.
          const [details] = await dbPool.execute<RowDataPacket[]>(
            `SELECT p.title, p.id as post_id 
              FROM posts p 
              WHERE p.id = ?`,
            [weave.post_id]
          );

          if (details.length > 0) {
            const postTitle = details[0].title;
            const postId = details[0].post_id;
            const actorName = req.user?.username || "Someone"; // The one who triggered this action

            // Determine recipient (the other party)
            const isActorGiver = weave.giver_id === userId;
            const recipientId = isActorGiver
              ? weave.receiver_id
              : weave.giver_id;

            if (status === "cancelled") {
              await createNotification(io, {
                recipient_id: recipientId,
                sender_id: userId,
                type: "ORDER_UPDATE",
                title: "Weave Cancelled",
                content: `${actorName} cancelled the weave for "${postTitle}"`,
                link: `/user?highlightWeaveId=${weaveId}`,
              });
            } else if (status === "completed") {
              // If fully completed
              const [check] = await dbPool.execute<RowDataPacket[]>(
                `SELECT status FROM weaves WHERE id = ?`,
                [weaveId]
              );

              if (check[0]?.status === "completed") {
                // Notify BOTH about completion
                // 1. Notify the other party
                await createNotification(io, {
                  recipient_id: recipientId,
                  sender_id: userId,
                  type: "ORDER_UPDATE",
                  title: "Weave Completed",
                  content: `Weave for "${postTitle}" is successfully completed!`,
                  link: `/user?highlightWeaveId=${weaveId}`,
                });

                // 2. Notify the actor too? Maybe not needed as they just clicked it.
                // But maybe good for confirmation. User didn't ask for self-notification.
              } else {
                // Just one side confirmed. Notify the other side.
                await createNotification(io, {
                  recipient_id: recipientId,
                  sender_id: userId,
                  type: "ORDER_UPDATE",
                  title: "Weave Confirmed",
                  content: `${actorName} confirmed the weave for "${postTitle}". Waiting for your confirmation.`,
                  link: `/user?highlightWeaveId=${weaveId}`,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Weave update notification failed", e);
      }

      if (status === "completed") {
        updateUserStats(weave.giver_id.toString()).catch(console.error);
        updateUserStats(weave.receiver_id.toString()).catch(console.error);
      }
      return res.status(200).json({
        message: "Success",
        newStatus: status,
        fullyCompleted: status === "completed",
      });
    } catch (error) {
      if (connection) await connection.rollback();
      res.status(500).json({ errorMessage: "Server error" });
    } finally {
      connection.release();
    }
  }
);

// ✅ [補回] GET /public/:uuid - 公開交易紀錄
router.get("/public/:uuid", async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const [userRows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE public_id = ?`,
      [uuid]
    );
    if (userRows.length === 0)
      return res.status(404).json({ errorMessage: "User not found" });

    const userId = userRows[0].id;
    const query = `${WEAVE_QUERY_BASE} WHERE (w.giver_id = ? OR w.receiver_id = ?) GROUP BY w.id ORDER BY w.created_at DESC`;
    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [
      userId,
      userId,
    ]);
    return res.status(200).json({ weaves: processWeaveRows(weaveRows) });
  } catch (error) {
    res.status(500).json({ errorMessage: "Failed" });
  }
});

export default router;
