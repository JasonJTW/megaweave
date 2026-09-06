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

    // 從 user_stats 表獲取統計資料
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

    const [statsRows] = await dbPool.execute<RowDataPacket[]>(statsQuery, [
      userId,
    ]);

    // 獲取使用者的所有貼文，並 JOIN 圖片資訊
    // **修正: 參考 posts.ts，使用 GROUP_CONCAT 獲取 URL 字串，避免 JSON 解析錯誤**
    const postsQuery = `
      SELECT 
        p.*, 
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN images i ON p.id = i.post_id
      WHERE p.user_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const [posts] = await dbPool.execute<RowDataPacket[]>(postsQuery, [userId]);

    // **修正: 移除原有的 postsWithImages 映射和 JSON.parse 邏輯**
    // 直接使用 posts 變數，它包含 s3_keys 欄位。

    // 如果沒有統計記錄，返回初始值
    if (statsRows.length === 0) {
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
        posts: posts || [],
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
      posts: posts || [],
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return res.status(500).json({
      errorMessage: "Failed to fetch user stats",
    });
  }
});

// GET /api/user/stats/public/:uuid - 獲取公開統計（for 公開頁面）
router.get("/public/:uuid", async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;

    // 驗證 UUID 格式
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        errorMessage: "Invalid user ID format",
      });
    }

    // 先查找用戶的 internal ID
    const userQuery = `SELECT id FROM users WHERE public_id = ?`;
    const [userRows] = await dbPool.execute<RowDataPacket[]>(userQuery, [uuid]);

    if (userRows.length === 0) {
      return res.status(404).json({
        errorMessage: "User not found",
      });
    }

    const userId = userRows[0].id;

    // 查詢統計數據
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

    const [statsRows] = await dbPool.execute<RowDataPacket[]>(statsQuery, [
      userId,
    ]);

    // 獲取使用者的所有貼文，並 JOIN 圖片資訊
    // **修正: 參考 posts.ts，使用 GROUP_CONCAT 獲取 URL 字串，避免 JSON 解析錯誤**
    const postsQuery = `
      SELECT 
        p.*, 
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN images i ON p.id = i.post_id
      WHERE p.user_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const [posts] = await dbPool.execute<RowDataPacket[]>(postsQuery, [userId]);

    // **修正: 移除原有的 postsWithImages 映射和 JSON.parse 邏輯**
    // 直接使用 posts 變數。

    if (statsRows.length === 0) {
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
        posts: posts || [],
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
      posts: posts || [],
    });
  } catch (error) {
    console.error("Error fetching public stats:", error);
    return res.status(500).json({
      errorMessage: "Failed to fetch user stats",
    });
  }
});

// POST /api/user/stats/refresh - 手動重新計算統計（需要登入）
router.post("/refresh", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        errorMessage: "User ID not found, Please signin first",
      });
    }

    const userId = req.user.userId;

    // 呼叫 updateUserStats 重新計算
    const result = await updateUserStats(userId.toString());

    if (!result.success) {
      return res.status(500).json({
        errorMessage: "Failed to refresh user stats",
        error: result.error,
      });
    }

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
    const limitNum = Math.min(parseInt(limit as string) || 10, 100);

    // 決定排序欄位
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

    const query = `
      SELECT 
        u.id,
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
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
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE us.${orderBy} > 0
      ORDER BY us.${orderBy} DESC
      LIMIT ?
    `;

    const [rows] = await dbPool.query(query, [limitNum]);

    const leaderboard = (rows as RowDataPacket[]).map((row, index) => ({
      rank: index + 1,
      userId: row.public_id,
      username: row.username,
      avatarUrl: row.avatar_url,
      postCount: row.post_count || 0,
      weaveCount: row.weave_count || 0,
      weaveAsGiver: row.weave_as_giver || 0,
      totalQuantityGiven: row.total_quantity_given || 0,
      totalQuantityReceived: row.total_quantity_received || 0,
      points: parseFloat(row.points) || 0,
      giveSuccessRate: parseFloat(row.give_success_rate) || 0,
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
