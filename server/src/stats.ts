// server/src/stats.ts
import Router, { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { updateUserStats } from "./utils/updateUserStats";

const router = Router();

// GET /api/user/stats - 獲取當前用戶統計
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        errorMessage: "User ID not found, Please signin first",
      });
    }

    const userId = req.user.userId;

    // 優化 1: 改用 .execute()
    const query = `
      SELECT 
        post_count,
        item_count,
        total_item_quantity,
        posts_with_items,
        weave_count,
        weave_as_giver,
        weave_as_receiver,
        total_quantity_given,
        total_quantity_received,
        total_likes,
        total_comments,
        total_views,
        points,
        give_success_rate,
        last_calculated_at
      FROM user_stats
      WHERE user_id = ?
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [userId]);

    // 如果沒有記錄，返回初始值
    if (rows.length === 0) {
      return res.status(200).json({
        postCount: 0,
        itemCount: 0,
        totalItemQuantity: 0,
        postsWithItems: 0,
        weaveCount: 0,
        weaveAsGiver: 0,
        weaveAsReceiver: 0,
        totalQuantityGiven: 0,
        totalQuantityReceived: 0,
        totalLikes: 0,
        totalComments: 0,
        totalViews: 0,
        points: 0,
        giveSuccessRate: 0,
        lastCalculatedAt: null,
      });
    }

    const stats = rows[0];

    return res.status(200).json({
      postCount: stats.post_count || 0,
      itemCount: stats.item_count || 0,
      totalItemQuantity: stats.total_item_quantity || 0,
      postsWithItems: stats.posts_with_items || 0,
      weaveCount: stats.weave_count || 0,
      weaveAsGiver: stats.weave_as_giver || 0,
      weaveAsReceiver: stats.weave_as_receiver || 0,
      totalQuantityGiven: stats.total_quantity_given || 0,
      totalQuantityReceived: stats.total_quantity_received || 0,
      totalLikes: stats.total_likes || 0,
      totalComments: stats.total_comments || 0,
      totalViews: stats.total_views || 0,
      points: Number(stats.points) || 0, // 確保轉為數字
      giveSuccessRate: Number(stats.give_success_rate) || 0,
      lastCalculatedAt: stats.last_calculated_at,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return res.status(500).json({
      errorMessage: "Failed to fetch user stats",
    });
  }
});

// GET /api/user/stats/public/:uuid - 獲取公開統計
router.get("/public/:uuid", async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        errorMessage: "Invalid user ID format",
      });
    }

    // ========== 新增：步驟 1. 檢查用戶是否存在 ==========
    const userQuery = `SELECT id FROM users WHERE public_id = ?`;
    const [userRows] = await dbPool.execute<RowDataPacket[]>(userQuery, [uuid]);

    if (userRows.length === 0) {
      // 找不到 public_id 對應的用戶，返回 404
      return res.status(404).json({
        errorMessage: "User not found",
      });
    }

    const userId = userRows[0].id;
    // ===============================================

    // 優化 2: 查詢統計數據 (使用內部 ID)
    const statsQuery = `
      SELECT 
        post_count,
        item_count,
        total_item_quantity,
        posts_with_items,
        weave_count,
        weave_as_giver,
        weave_as_receiver,
        total_quantity_given,
        total_quantity_received,
        total_likes,
        total_comments,
        total_views,
        points,
        give_success_rate,
        last_calculated_at
      FROM user_stats
      WHERE user_id = ?
    `;

    // 這裡我們改用 dbPool.execute 查詢 user_stats (優化 1 的效果仍在)
    const [statsRows] = await dbPool.execute<RowDataPacket[]>(statsQuery, [
      userId,
    ]);

    if (statsRows.length === 0) {
      // 用戶存在，但還沒有任何統計數據（例如剛註冊，尚未計算過積分），返回 0 數據
      return res.status(200).json({
        postCount: 0,
        itemCount: 0,
        totalItemQuantity: 0,
        postsWithItems: 0,
        weaveCount: 0,
        weaveAsGiver: 0,
        weaveAsReceiver: 0,
        totalQuantityGiven: 0,
        totalQuantityReceived: 0,
        totalLikes: 0,
        totalComments: 0,
        totalViews: 0,
        points: 0,
        giveSuccessRate: 0,
        lastCalculatedAt: null,
      });
    }

    const stats = statsRows[0];

    return res.status(200).json({
      postCount: stats.post_count || 0,
      itemCount: stats.item_count || 0,
      totalItemQuantity: stats.total_item_quantity || 0,
      postsWithItems: stats.posts_with_items || 0,
      weaveCount: stats.weave_count || 0,
      weaveAsGiver: stats.weave_as_giver || 0,
      weaveAsReceiver: stats.weave_as_receiver || 0,
      totalQuantityGiven: stats.total_quantity_given || 0,
      totalQuantityReceived: stats.total_quantity_received || 0,
      totalLikes: stats.total_likes || 0,
      totalComments: stats.total_comments || 0,
      totalViews: stats.total_views || 0,
      points: Number(stats.points) || 0,
      giveSuccessRate: Number(stats.give_success_rate) || 0,
      lastCalculatedAt: stats.last_calculated_at,
    });
  } catch (error) {
    console.error("Error fetching public stats:", error);
    return res.status(500).json({
      errorMessage: "Failed to fetch user stats",
    });
  }
});

// POST /api/user/stats/refresh - 手動重新計算統計
router.post("/refresh", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        errorMessage: "User ID not found, Please signin first",
      });
    }

    const userId = req.user.userId;

    // 呼叫更新好的 updateUserStats
    const result = await updateUserStats(userId.toString());

    if (!result.success) {
      return res.status(500).json({
        errorMessage: "Failed to refresh user stats",
        error: result.error,
      });
    }

    // 這裡直接回傳更新後的完整 stats (包含新的 balanceLevel 等欄位)
    return res.status(200).json({
      message: "Stats refreshed successfully",
      stats: result.stats,
    });
  } catch (error) {
    console.error("Error refreshing user stats:", error);
    return res.status(500).json({
      errorMessage: "Failed to refresh user stats",
    });
  }
});

// GET /api/user/stats/leaderboard - 獲取排行榜
router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const { type = "points", limit = "10" } = req.query;
    // 確保 limit 是字串類型的數字 (為了下面 execute 使用)
    const limitVal = Math.min(parseInt(limit as string) || 10, 100);

    // 安全檢查：決定排序欄位 (避免 SQL Injection)
    let orderBy = "points";
    switch (type) {
      case "givers":
        orderBy = "total_quantity_given";
        break;
      case "weaves":
        orderBy = "weave_count";
        break;
      case "posts":
        orderBy = "post_count";
        break;
      case "points":
      default:
        orderBy = "points";
        break;
    }

    // 優化 3: 改用 .execute()
    // 注意: ORDER BY 欄位名稱不能參數化 (也不能用 ?)，所以我們上面用 switch 嚴格過濾
    // 但是 LIMIT 的數值是可以用 ? 參數化的 (需為字串)
    const query = `
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.public_id,
        us.post_count,
        us.weave_count,
        us.weave_as_giver,
        us.total_quantity_given,
        us.total_quantity_received,
        us.points,
        us.give_success_rate
      FROM user_stats us
      INNER JOIN users u ON us.user_id = u.id
      WHERE us.${orderBy} > 0
      ORDER BY us.${orderBy} DESC
      LIMIT ?
    `;

    // execute 的參數通常都轉成 string 比較保險，雖然 mysql2 也支援 number
    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [
      limitVal.toString(),
    ]);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      userId: row.public_id,
      username: row.username,
      avatarUrl: row.avatar_url,
      postCount: row.post_count || 0,
      weaveCount: row.weave_count || 0,
      weaveAsGiver: row.weave_as_giver || 0,
      totalQuantityGiven: row.total_quantity_given || 0,
      totalQuantityReceived: row.total_quantity_received || 0,
      points: Number(row.points) || 0,
      giveSuccessRate: Number(row.give_success_rate) || 0,
    }));

    return res.status(200).json({
      type,
      leaderboard,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return res.status(500).json({
      errorMessage: "Failed to fetch leaderboard",
    });
  }
});

export default router;
