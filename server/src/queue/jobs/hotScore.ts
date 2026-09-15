// server/src/queue/jobs/hotScore.ts
// Job 型別定義 + Processor：定期計算全站貼文 HotScore，更新 Redis feed:trending 及 MySQL posts.hot_score

import { Job } from "bullmq";
import { getCacheRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { RowDataPacket } from "mysql2";

interface PostScoreRow extends RowDataPacket {
  id: number;
  status: string;
  view_count: number;
  likes_count: number;
  created_at: Date;
  comment_count: number;
  weave_count: number;
}

/**
 * 計算單篇貼文的 HotScore (結合 Hacker News 重力衰減與新品 Boost)
 */
export function calculatePostHotScore(post: {
  status: string;
  view_count: number;
  likes_count: number;
  comment_count: number;
  weave_count: number;
  created_at: Date | string;
}): number {
  // 非 active 狀態（已過期、已關閉等）熱門分數歸零
  if (post.status !== "active") {
    return 0;
  }

  // 1. 互動基礎分 (Engagement Score)
  const views = Number(post.view_count || 0);
  const likes = Number(post.likes_count || 0);
  const comments = Number(post.comment_count || 0);
  const weaves = Number(post.weave_count || 0);

  const engagement = views * 1 + likes * 5 + comments * 8 + weaves * 15;

  // 2. 時間衰減 (Gravity Time Decay)
  const createdAtMs = new Date(post.created_at).getTime();
  const ageHours = Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60));

  // 重力公式：(Engagement + 1) / (AgeInHours + 2)^1.5
  let score = (engagement + 1) / Math.pow(ageHours + 2, 1.5);

  // 3. 新品探索 Boost (發佈 24 小時內給予 20% 曝光加權)
  if (ageHours <= 24) {
    score *= 1.2;
  }

  return Math.round(score * 10000) / 10000;
}

/**
 * HotScore 定期排程 Processor
 * 1. 撈取全站貼文及其互動數據
 * 2. 計算各貼文 HotScore
 * 3. 原子更新 Redis ZSET feed:trending
 * 4. 批次更新 MySQL posts.hot_score
 */
export async function processCalculateHotScore(
  job?: Job,
): Promise<{ postCount: number; trendingCount: number }> {
  const logPrefix = "🔥 [hot-score-worker]";

  const log = async (msg: string) => {
    if (job) await job.log(`${logPrefix} ${msg}`);
  };
  const logWarn = async (msg: string, err?: unknown) => {
    console.warn(`${logPrefix} – ${msg}`, err);
    if (job) await job.log(`⚠️ ${logPrefix} ${msg}: ${String(err)}`);
  };
  const logError = async (msg: string, err?: unknown) => {
    console.error(`${logPrefix} – ${msg}`, err);
    const errText = err instanceof Error ? err.stack || err.message : String(err);
    if (job) await job.log(`❌ ${logPrefix} ${msg}: ${errText}`);
  };

  await log("start calculating hot scores for all posts...");

  // 1. 查詢所有未刪除的貼文及其最新互動數據
  const query = `
    SELECT 
      p.id,
      p.status,
      p.view_count,
      p.likes_count,
      p.created_at,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = 0) AS comment_count,
      (SELECT COUNT(*) FROM weaves w WHERE w.post_id = p.id) AS weave_count
    FROM posts p
    WHERE p.deleted_at IS NULL
  `;

  const [posts] = await dbPool.execute<PostScoreRow[]>(query);
  await log(`fetched ${posts.length} posts from database`);

  if (posts.length === 0) {
    await log("no posts to calculate, finished");
    return { postCount: 0, trendingCount: 0 };
  }

  // 2. 計算每篇貼文的分數
  const scores: Array<{ id: number; score: number; status: string }> = [];
  const zsetMembers: Array<{ score: number; value: string }> = [];

  for (const post of posts) {
    const score = calculatePostHotScore(post);
    scores.push({ id: post.id, score, status: post.status });

    // 只有 active 且 score > 0 的商品納入 Redis feed:trending
    if (post.status === "active") {
      zsetMembers.push({
        score: score,
        value: String(post.id),
      });
    }
  }

  // 3. 更新 Redis ZSET feed:trending（採用原子交換 RENAME 模式，避免殘留過期商品）
  const redis = getCacheRedisClient();
  const tempKey = `feed:trending:temp:${Date.now()}`;

  try {
    if (zsetMembers.length > 0) {
      // 批次寫入 temp ZSET
      await redis.zAdd(tempKey, zsetMembers);
      // 原子置換成正式 feed:trending
      await redis.rename(tempKey, "feed:trending");
      await log(
        `Redis ZSET feed:trending updated with ${zsetMembers.length} active posts`,
      );
    } else {
      // 若全站無 active 貼文，清空 trending
      await redis.del("feed:trending");
      await log("Redis ZSET feed:trending cleared (no active posts)");
    }
  } catch (redisErr) {
    await logError("Redis update error", redisErr);
    // 清理臨時 key
    await redis.del(tempKey).catch(() => {});
  }

  // 4. 批次更新 MySQL posts.hot_score
  try {
    // 依批次更新 (每批 100 筆)
    const BATCH_SIZE = 100;
    for (let i = 0; i < scores.length; i += BATCH_SIZE) {
      const chunk = scores.slice(i, i + BATCH_SIZE);
      const caseStatements = chunk.map(() => "WHEN id = ? THEN ?").join(" ");
      const ids = chunk.map((c) => c.id);
      const params: (number | string)[] = [];

      for (const item of chunk) {
        params.push(item.id, item.score);
      }
      params.push(...ids);

      const updateSql = `
        UPDATE posts
        SET hot_score = CASE ${caseStatements} ELSE hot_score END
        WHERE id IN (${ids.map(() => "?").join(",")})
      `;

      await dbPool.execute(updateSql, params);
    }
    await log(`MySQL posts.hot_score updated for ${scores.length} posts`);
  } catch (dbErr) {
    await logError("MySQL batch update error", dbErr);
  }

  await log("calculation completed ✅");

  // 記錄本次執行時間，供啟動時防抖判斷（TTL 1 小時，防止 key 永久殘留）
  try {
    const redis = getCacheRedisClient();
    await redis.set("hot-score:last-run", String(Date.now()), { EX: 60 * 60 });
  } catch (err) {
    await logWarn("failed to write last-run timestamp", err);
  }

  return {
    postCount: scores.length,
    trendingCount: zsetMembers.length,
  };
}
