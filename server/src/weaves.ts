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
}

interface ItemRow extends RowDataPacket {
  id: number;
  quantity: number;
  title: string;
}

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
    const { role } = req.query; // 'giver' | 'receiver' | undefined

    let whereClause = "";
    const params: any[] = [];

    if (role === "giver") {
      whereClause = "WHERE w.giver_id = ?";
      params.push(userId);
    } else if (role === "receiver") {
      whereClause = "WHERE w.receiver_id = ?";
      params.push(userId);
    } else {
      whereClause = "WHERE w.giver_id = ? OR w.receiver_id = ?";
      params.push(userId, userId);
    }

    // 修正：加入 images table 並使用 GROUP_CONCAT 避免重複 row
    const query = `
      SELECT 
        w.*,
        p.title as post_title,
        i.title as item_title,
        giver.username as giver_name,
        giver.avatar_url as giver_avatar,
        receiver.username as receiver_name,
        receiver.avatar_url as receiver_avatar,
        GROUP_CONCAT(img.thumbnail_url) as thumbnail_urls
      FROM weaves w
      JOIN posts p ON w.post_id = p.id
      LEFT JOIN items i ON w.item_id = i.id
      JOIN users giver ON w.giver_id = giver.id
      JOIN users receiver ON w.receiver_id = receiver.id
      LEFT JOIN images img ON p.id = img.post_id
      ${whereClause}
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `;

    const [weaves] = await dbPool.execute<RowDataPacket[]>(query, params);

    // 處理 thumbnail_urls 字串轉陣列
    const processedWeaves = weaves.map((weave: any) => ({
      ...weave,
      thumbnail_urls: weave.thumbnail_urls
        ? weave.thumbnail_urls.split(",")
        : [],
    }));

    return res.status(200).json({ weaves: processedWeaves });
  } catch (error) {
    console.error("Error fetching weaves:", error);
    return res.status(500).json({ errorMessage: "Failed to fetch weaves" });
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
      const [weaves] = await connection.execute<WeaveRow[]>(weaveQuery, [
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

export default router;
