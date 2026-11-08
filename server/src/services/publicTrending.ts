//* 公開熱門排行 feed:trending 跟著組織物品進出 Public（#140，ADR 0003：排行只收 Public）
//* - 升到 Public：依目前互動數算分數加入（與新貼文相同：key 不存在時交給 hot score 重算，不建出只有一篇的 ZSET）
//* - 從 Public 降級：移除；Feed 的 hydration 仍以 publicSurfaceCondition 過濾，殘留也不會被回傳
import type { RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { getCacheRedisClient } from "../utils/redis";
import { calculatePostHotScore } from "../queue/jobs/hotScore";
import type { AudienceTier } from "./postVisibility";

const TRENDING_KEY = "feed:trending";

export async function syncPublicTrending(
  postId: number,
  fromTier: AudienceTier,
  toTier: AudienceTier,
): Promise<void> {
  if (fromTier === toTier || (fromTier !== "public" && toTier !== "public")) return;
  const redis = getCacheRedisClient();
  if (fromTier === "public") {
    await redis.zRem(TRENDING_KEY, String(postId));
    return;
  }
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT status, view_count, likes_count, comment_count, created_at FROM posts WHERE id = ? AND deleted_at IS NULL",
    [postId],
  );
  if (rows.length === 0) return;
  const row = rows[0];
  const score = calculatePostHotScore({
    status: String(row.status),
    view_count: Number(row.view_count ?? 0),
    likes_count: Number(row.likes_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    weave_count: 0,
    created_at: row.created_at,
  });
  if (score <= 0) return;
  if (await redis.exists(TRENDING_KEY)) {
    await redis.zAdd(TRENDING_KEY, { score, value: String(postId) });
  }
}
