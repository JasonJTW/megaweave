// server/src/utils/updateUserStats.ts
import { RowDataPacket, ResultSetHeader } from "mysql2";
import dbPool from "./db";

interface UserStats {
  postCount: number;
  itemCount: number;
  totalItemQuantity: number;
  postsWithItems: number;
  weaveAsGiver: number;
  weaveAsReceiver: number;
  weaveCount: number;
  totalQuantityGiven: number;
  totalQuantityReceived: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
}

interface UpdateResult {
  success: boolean;
  stats?: UserStats & {
    points: number;
    giveSuccessRate: string | number;
    givePoints: number;
    receivePoints: number;
    receiveMultiplier: string;
    balanceLevel: string;
  };
  error?: unknown;
  errorCode?: string;
}

/**
 * 更新使用者統計資料並計算積分 (優化版: 使用 Prepared Statements 與 Pre-aggregated Joins)
 * @param userId - 使用者 ID
 * @returns 更新結果
 */
export async function updateUserStats(userId: string): Promise<UpdateResult> {
  let connection;

  try {
    // 從連線池取得連線
    connection = await dbPool.getConnection();

    // =========================================================================
    // 1. 數據獲取優化：使用衍生表 (Derived Tables) + LEFT JOIN
    // =========================================================================
    // 這種寫法避免了直接 JOIN 導致的「笛卡兒積」數據重複計算問題，同時比多個純子查詢更快。
    // 我們將 posts, items, weaves 分別在各自的子查詢中聚合後，再合併。
    const statsQuery = `
      SELECT 
        COALESCE(p.post_count, 0) AS post_count,
        COALESCE(p.total_likes, 0) AS total_likes,
        COALESCE(p.total_comments, 0) AS total_comments,
        COALESCE(p.total_views, 0) AS total_views,
        
        COALESCE(i.item_count, 0) AS item_count,
        COALESCE(i.total_item_quantity, 0) AS total_item_quantity,
        COALESCE(i.posts_with_items, 0) AS posts_with_items,
        
        COALESCE(wg.weave_as_giver, 0) AS weave_as_giver,
        COALESCE(wg.total_quantity_given, 0) AS total_quantity_given,
        
        COALESCE(wr.weave_as_receiver, 0) AS weave_as_receiver,
        COALESCE(wr.total_quantity_received, 0) AS total_quantity_received
        
      FROM (SELECT ? AS uid) AS u
      
      -- 1. 聚合貼文數據
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS post_count, SUM(likes_count) AS total_likes, SUM(comment_count) AS total_comments, SUM(view_count) AS total_views
        FROM posts WHERE user_id = ? AND deleted_at IS NULL
        GROUP BY user_id
      ) AS p ON u.uid = p.user_id
      
      -- 2. 聚合物品數據
      LEFT JOIN (
        SELECT p.user_id, COUNT(i.id) AS item_count, SUM(i.quantity) AS total_item_quantity, COUNT(DISTINCT p.id) AS posts_with_items
        FROM posts p JOIN items i ON p.id = i.post_id
        WHERE p.user_id = ? AND p.deleted_at IS NULL
        GROUP BY p.user_id
      ) AS i ON u.uid = i.user_id
      
      -- 3. 聚合給予數據 (Weave Giver)
      LEFT JOIN (
        SELECT giver_id, COUNT(*) AS weave_as_giver, SUM(quantity) AS total_quantity_given
        FROM weaves WHERE giver_id = ? AND status = 'completed'
        GROUP BY giver_id
      ) AS wg ON u.uid = wg.giver_id
      
      -- 4. 聚合接收數據 (Weave Receiver)
      LEFT JOIN (
        SELECT receiver_id, COUNT(*) AS weave_as_receiver, SUM(quantity) AS total_quantity_received
        FROM weaves WHERE receiver_id = ? AND status = 'completed'
        GROUP BY receiver_id
      ) AS wr ON u.uid = wr.receiver_id;
    `;

    // 注意：因為有 5 個 ? 佔位符 (1個在 FROM，4個在 JOIN)，需要傳入 5 次 userId
    // 使用 .execute() 啟用 Prepared Statements
    const [rows] = await connection.execute<RowDataPacket[]>(statsQuery, [
      userId,
      userId,
      userId,
      userId,
      userId,
    ]);

    const raw = rows[0];

    // 數據轉換與防呆 (雖然 COALESCE 處理了 NULL，但這裡再次確保類型安全)
    const stats: UserStats = {
      postCount: Number(raw.post_count),
      itemCount: Number(raw.item_count),
      totalItemQuantity: Number(raw.total_item_quantity),
      postsWithItems: Number(raw.posts_with_items),
      weaveAsGiver: Number(raw.weave_as_giver),
      weaveAsReceiver: Number(raw.weave_as_receiver),
      weaveCount: Number(raw.weave_as_giver) + Number(raw.weave_as_receiver),
      totalQuantityGiven: Number(raw.total_quantity_given),
      totalQuantityReceived: Number(raw.total_quantity_received),
      totalLikes: Number(raw.total_likes),
      totalComments: Number(raw.total_comments),
      totalViews: Number(raw.total_views),
    };

    // =========================================================================
    // 2. 積分邏輯運算 (方案 C: 階梯式 + 邊際遞減)
    // =========================================================================
    const totalGiven = stats.totalQuantityGiven;
    const totalReceived = stats.totalQuantityReceived;

    let receiveMultiplier = 1.0;
    let balanceLevel = "無接收記錄";

    if (totalReceived > 0) {
      if (totalGiven === 0) {
        receiveMultiplier = 0.1;
        balanceLevel = "🚫 極差 - 只拿不給";
      } else {
        const giveReceiveRatio = totalGiven / totalReceived;

        if (giveReceiveRatio >= 1.0) {
          receiveMultiplier = 1.0;
          balanceLevel = "🟢 優秀 - 平衡交流";
        } else if (giveReceiveRatio >= 0.7) {
          receiveMultiplier = 0.8 + (giveReceiveRatio - 0.7) * 0.67;
          balanceLevel = "🟡 良好 - 略偏接收";
        } else if (giveReceiveRatio >= 0.4) {
          receiveMultiplier = 0.5 + (giveReceiveRatio - 0.4) * 1.0;
          balanceLevel = "🟠 普通 - 需多給予";
        } else if (giveReceiveRatio >= 0.2) {
          receiveMultiplier = 0.25 + (giveReceiveRatio - 0.2) * 1.25;
          balanceLevel = "🔴 偏低 - 請多分享";
        } else {
          receiveMultiplier = 0.1 + (giveReceiveRatio / 0.2) * 0.15;
          balanceLevel = "🚫 極差 - 嚴重失衡";
        }
      }
    }

    const givePoints = totalGiven * 5;
    const receivePoints = Math.round(totalReceived * 1 * receiveMultiplier);

    const interactionPoints =
      stats.totalLikes * 1 +
      stats.totalComments * 3 +
      givePoints +
      receivePoints;

    // 活躍度獎勵
    const activityBonus = Math.min(stats.postCount * 2, 100);

    // 品質乘數
    const totalInteractions =
      stats.totalLikes + stats.totalComments + stats.weaveAsGiver;
    const interactionRate =
      stats.totalViews > 0 ? totalInteractions / stats.totalViews : 0;
    const qualityMultiplier = 1 + Math.min(interactionRate * 2, 1);

    // 最終積分
    const points = Math.round(
      interactionPoints * qualityMultiplier + activityBonus
    );

    // 給予成功率
    const giveSuccessRate =
      stats.postCount > 0
        ? ((stats.weaveAsGiver / stats.postCount) * 100).toFixed(2)
        : 0;

    // =========================================================================
    // 3. 數據寫回 (使用 .execute)
    // =========================================================================
    const updateQuery = `
      INSERT INTO user_stats (
        user_id, 
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        post_count = VALUES(post_count),
        item_count = VALUES(item_count),
        total_item_quantity = VALUES(total_item_quantity),
        posts_with_items = VALUES(posts_with_items),
        weave_count = VALUES(weave_count),
        weave_as_giver = VALUES(weave_as_giver),
        weave_as_receiver = VALUES(weave_as_receiver),
        total_quantity_given = VALUES(total_quantity_given),
        total_quantity_received = VALUES(total_quantity_received),
        total_likes = VALUES(total_likes),
        total_comments = VALUES(total_comments),
        total_views = VALUES(total_views),
        points = VALUES(points),
        give_success_rate = VALUES(give_success_rate),
        last_calculated_at = NOW()
    `;

    await connection.execute<ResultSetHeader>(updateQuery, [
      userId,
      stats.postCount,
      stats.itemCount,
      stats.totalItemQuantity,
      stats.postsWithItems,
      stats.weaveCount,
      stats.weaveAsGiver,
      stats.weaveAsReceiver,
      stats.totalQuantityGiven,
      stats.totalQuantityReceived,
      stats.totalLikes,
      stats.totalComments,
      stats.totalViews,
      points,
      giveSuccessRate,
    ]);

    return {
      success: true,
      stats: {
        ...stats,
        points,
        giveSuccessRate,
        givePoints,
        receivePoints,
        receiveMultiplier: (receiveMultiplier * 100).toFixed(1) + "%",
        balanceLevel,
      },
    };
  } catch (error) {
    console.error("Error updating user stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: (error as { code?: string })?.code,
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 批次更新多個使用者的統計資料
 * @param userIds - 使用者 ID 陣列
 * @returns 更新結果摘要
 */
export async function batchUpdateUserStats(userIds: string[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ userId: string; error: unknown }>;
}> {
  let successCount = 0;
  let failedCount = 0;
  const errors: Array<{ userId: string; error: unknown }> = [];

  for (const userId of userIds) {
    try {
      const result = await updateUserStats(userId);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push({ userId, error: result.error });
      }

      // 這裡也可以考慮使用 Promise.all 併發處理，
      // 但為了避免瞬間大量 connection 請求，保持序列執行並帶小延遲是比較穩健的做法
      if ((successCount + failedCount) % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      failedCount++;
      errors.push({ userId, error });
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    errors,
  };
}
