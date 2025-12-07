import Router, { Request, Response } from "express";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { updateUserStats } from "./utils/updateUserStats"; // 引入你提供的統計函式

const router = Router();

// 定義 Weave 的資料庫結構型別
interface WeaveRow extends RowDataPacket {
  id: number;
  post_id: number;
  item_id: number | null;
  giver_id: number;
  receiver_id: number;
  quantity: number;
  status: "pending" | "completed" | "cancelled";
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
// 輸出型別，包含所有 post 相關欄位
interface WeaveOutput extends RowDataPacket {
  // Weaves (w.*)
  id: number;
  post_id: number;
  item_id: number | null;
  giver_id: number;
  receiver_id: number;
  quantity: number;
  status: "pending" | "completed" | "cancelled";
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;

  // Posts (p.* - 全部加上 post_ 前綴)
  post_id_original: number;
  post_user_id: number;
  post_title: string;
  post_content: string;
  post_type: "seek" | "wish" | "share" | "commons";
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

  // JOIN 來的其他欄位
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

// 🔧 共用函數：處理 Weave 資料
function processWeaveRows(weaveRows: WeaveOutput[]) {
  return weaveRows.map((row) => {
    // 提取 Post 相關資料
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
      // 分割 image_urls 字串成陣列
      image_urls: row.image_urls ? row.image_urls.split(",") : [],
    };

    // 建立 Weave 物件 (手動組裝 w.* 的欄位)
    const weave: any = {
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

      // JOIN 來的其他欄位
      item_title: row.item_title,
      giver_name: row.giver_name,
      giver_avatar: row.giver_avatar,
      receiver_name: row.receiver_name,
      receiver_avatar: row.receiver_avatar,

      // ✅ 內嵌 post 物件
      post: post,
    };

    return weave;
  });
}

// 🔧 共用 SQL 查詢字串
const WEAVE_QUERY_BASE = `
  SELECT 
      w.*,
      -- 貼文 (posts) 的所有欄位 (需重新命名避免衝突)
      p.id AS post_id_original,
      p.user_id AS post_user_id,
      p.title AS post_title,
      p.content AS post_content,
      p.type AS post_type,
      p.status AS post_status_original,
      p.location AS post_location,
      p.tags AS post_tags,
      p.category_id AS post_category_id,
      p.condition_level AS post_condition_level,
      p.expires_at AS post_expires_at,
      p.view_count AS post_view_count,
      p.likes_count AS post_likes_count,
      p.created_at AS post_created_at,
      p.updated_at AS post_updated_at,
      p.comment_count AS post_comment_count,
      
      -- 其他 JOIN 的欄位
      i.title AS item_title,
      giver.username AS giver_name,
      giver.avatar_url AS giver_avatar,
      receiver.username AS receiver_name,
      receiver.avatar_url AS receiver_avatar,
      GROUP_CONCAT(img.image_url) AS image_urls
  FROM weaves w
  JOIN posts p ON w.post_id = p.id
  LEFT JOIN items i ON w.item_id = i.id
  JOIN users giver ON w.giver_id = giver.id
  JOIN users receiver ON w.receiver_id = receiver.id
  LEFT JOIN images img ON p.id = img.post_id
`;

// POST /api/weaves - 索取物品（建立 Weave 請求）
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { postId, itemId, quantity = 1, notes } = req.body;
    const receiverId = req.user!.userId;

    if (!postId) {
      return res.status(400).json({ errorMessage: "Post ID is required" });
    }

    // 1. 檢查 Post 是否存在
    const postQuery = `SELECT user_id, status, title FROM posts WHERE id = ?`;
    const [posts] = await dbPool.execute<RowDataPacket[]>(postQuery, [postId]);

    if (posts.length === 0) {
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    const post = posts[0];
    const giverId = post.user_id;

    if (giverId === receiverId) {
      return res
        .status(400)
        .json({ errorMessage: "Cannot weave your own post" });
    }

    if (post.status !== "active") {
      return res.status(400).json({ errorMessage: "Post is not active" });
    }

    // 2. 如果有指定 Item，檢查庫存
    if (itemId) {
      const itemQuery = `SELECT quantity FROM items WHERE id = ? AND post_id = ?`;
      const [items] = await dbPool.execute<RowDataPacket[]>(itemQuery, [
        itemId,
        postId,
      ]);

      if (items.length === 0) {
        return res
          .status(404)
          .json({ errorMessage: "Item not found in this post" });
      }

      if (items[0].quantity < quantity) {
        return res
          .status(400)
          .json({ errorMessage: "Requested quantity exceeds available stock" });
      }
    }

    // 3. 建立 Weave 紀錄
    const insertQuery = `
      INSERT INTO weaves (post_id, item_id, giver_id, receiver_id, quantity, status, notes)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `;

    const [result] = await dbPool.execute<ResultSetHeader>(insertQuery, [
      postId,
      itemId || null,
      giverId,
      receiverId,
      quantity,
      notes || null,
    ]);

    return res.status(201).json({
      message: "Weave request sent successfully",
      weaveId: result.insertId,
    });
  } catch (error) {
    console.error("Error creating weave:", error);
    return res
      .status(500)
      .json({ errorMessage: "Failed to create weave request" });
  }
});

// GET /api/weaves - 獲取我的交易列表 (包含圖片)
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

    const query = `
      ${WEAVE_QUERY_BASE}
      ${whereClause}
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `;

    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, params);

    // 使用共用函數處理結果
    const processedWeaves = processWeaveRows(weaveRows);

    return res.status(200).json({
      weaves: processedWeaves,
      message: "Weave list retrieved successfully",
    });
  } catch (error) {
    console.error("Error retrieving weaves:", error);
    return res.status(500).json({ errorMessage: "Failed to retrieve weaves" });
  }
});

// PATCH /api/weaves/:id/status - 更新交易狀態
router.patch(
  "/:id/status",
  requireAuth,
  async (req: Request, res: Response) => {
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();

      const weaveId = req.params.id;
      const { status } = req.body; // 'completed' | 'cancelled'
      const userId = req.user!.userId;

      if (!["completed", "cancelled"].includes(status)) {
        return res.status(400).json({ errorMessage: "Invalid status" });
      }

      // 鎖定該筆交易紀錄
      const weaveQuery = `SELECT * FROM weaves WHERE id = ? FOR UPDATE`;
      const [weaves] = await connection.execute<WeaveOutput[]>(weaveQuery, [
        weaveId,
      ]);

      if (weaves.length === 0) {
        await connection.rollback();
        return res.status(404).json({ errorMessage: "Weave not found" });
      }

      const weave = weaves[0];

      // 防止重複操作
      if (weave.status !== "pending") {
        await connection.rollback();
        return res
          .status(400)
          .json({ errorMessage: `Weave is already ${weave.status}` });
      }

      // ==========================================
      // 邏輯 A: 取消 (Cancelled)
      // ==========================================
      if (status === "cancelled") {
        // 權限檢查：Giver 和 Receiver 都可以取消
        if (
          weave.giver_id !== Number(userId) &&
          weave.receiver_id !== Number(userId)
        ) {
          await connection.rollback();
          return res.status(403).json({
            errorMessage: "You are not authorized to cancel this weave",
          });
        }

        // 更新狀態
        await connection.execute(
          `UPDATE weaves SET status = 'cancelled' WHERE id = ?`,
          [weaveId]
        );
      }

      // ==========================================
      // 邏輯 B: 完成 (Completed)
      // ==========================================
      else if (status === "completed") {
        // 權限檢查：只有 Giver 可以確認完成 (確認已給出)
        if (weave.giver_id !== Number(userId)) {
          await connection.rollback();
          return res
            .status(403)
            .json({ errorMessage: "Only the giver can complete the weave" });
        }

        // 如果有 item_id，需要扣庫存
        if (weave.item_id) {
          const checkItemQuery = `SELECT quantity FROM items WHERE id = ? FOR UPDATE`;
          const [items] = await connection.execute<ItemRow[]>(checkItemQuery, [
            weave.item_id,
          ]);

          if (items.length === 0) {
            await connection.rollback();
            return res
              .status(404)
              .json({ errorMessage: "Item no longer exists" });
          }

          if (items[0].quantity < weave.quantity) {
            await connection.rollback();
            return res.status(400).json({ errorMessage: "Insufficient stock" });
          }

          // 執行扣庫存
          await connection.execute(
            `UPDATE items SET quantity = quantity - ? WHERE id = ?`,
            [weave.quantity, weave.item_id]
          );
        }

        // 更新 Weave 狀態
        await connection.execute(
          `UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?`,
          [weaveId]
        );
      }

      // 提交交易 (Commit)
      await connection.commit();

      // ==========================================
      // 交易提交後，執行統計數據更新
      // ==========================================
      // 這裡不需要 await 阻擋 Response，但為了讓前端能立即獲得最新積分，建議 await
      // 只有在狀態變成 completed 時才需要更新積分？
      // 其實 cancelled 可能不影響積分，但為了保險起見或未來擴充（如取消率），可以都跑一次

      if (status === "completed") {
        try {
          // 更新雙方數據
          await Promise.all([
            updateUserStats(weave.giver_id.toString()),
            updateUserStats(weave.receiver_id.toString()),
          ]);
        } catch (statsError) {
          console.error("Background stats update failed:", statsError);
          // 注意：這裡不回傳 500，因為主要交易已經成功了，統計可以之後再修正
        }
      }

      return res.status(200).json({
        message: `Weave ${status} successfully`,
        newStatus: status,
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Error updating weave status:", error);
      return res
        .status(500)
        .json({ errorMessage: "Failed to update weave status" });
    } finally {
      if (connection) connection.release();
    }
  }
);

// 新增：GET /api/weaves/public/:uuid - 根據 UUID 獲取公開交易列表
router.get("/public/:uuid", async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;

    // 1. 驗證 UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({ errorMessage: "Invalid user UUID format" });
    }

    // 2. 查找用戶的 internal ID
    const userQuery = `SELECT id FROM users WHERE public_id = ?`;
    const [userRows] = await dbPool.execute<RowDataPacket[]>(userQuery, [uuid]);

    if (userRows.length === 0) {
      return res.status(404).json({ errorMessage: "User not found" });
    }
    const userId = userRows[0].id;

    // 3. ✅ 使用完整的 SQL 查詢 (與 GET / 相同)
    const query = `
      ${WEAVE_QUERY_BASE}
      WHERE (w.giver_id = ? OR w.receiver_id = ?)
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `;

    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [
      userId,
      userId,
    ]);

    // 4. ✅ 使用共用函數處理結果 (與 GET / 完全相同的處理邏輯)
    const processedWeaves = processWeaveRows(weaveRows);

    return res.status(200).json({
      weaves: processedWeaves,
      message: "Public weave list retrieved successfully",
    });
  } catch (error) {
    console.error("Error retrieving public weaves:", error);
    return res.status(500).json({ errorMessage: "Failed to retrieve weaves" });
  }
});

export default router;
