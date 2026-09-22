// server/src/benchmark/queue/setup.ts
// Burst 量測前的資料準備：挑選 fixture 使用者與貼文、寫入 burst 貼文，以及建立發文用的 session。

import { randomUUID } from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import type { AppStores } from "../fixture/fixtureProfile";
import type { BurstCandidates, BurstUnit } from "./burstPlan";
import type { BurstPost } from "./injection";

export async function loadBurstCandidates(mysql: Pool): Promise<BurstCandidates> {
  const [[users], [posts], [locations]] = await Promise.all([
    mysql.query<RowDataPacket[]>("SELECT id FROM users ORDER BY id"),
    mysql.query<RowDataPacket[]>(
      "SELECT id FROM posts WHERE status = 'active' AND deleted_at IS NULL AND embedding IS NOT NULL ORDER BY id",
    ),
    mysql.query<RowDataPacket[]>("SELECT id, province, city FROM locations ORDER BY id"),
  ]);
  return {
    userIds: users.map((row) => Number(row.id)),
    interactionPostIds: posts.map((row) => Number(row.id)),
    locations: locations.map((row) => ({ id: Number(row.id), province: String(row.province), city: String(row.city) })),
  };
}

/**
 * 以 production createPost 相同的欄位寫入 burst 貼文（貼文、物品、圖片 key），等同 API 已提交交易、尚待 worker 處理的狀態。
 * 寫入在量測開始前完成，burst 只量測 queue 與 worker。
 */
export async function insertBurstPosts(mysql: Pool, units: readonly BurstUnit[], runId: string): Promise<BurstPost[]> {
  const connection = await mysql.getConnection();
  try {
    await connection.beginTransaction();
    const posts: BurstPost[] = [];
    for (const unit of units) {
      const { post } = unit;
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO posts (
           public_id, user_id, title, content, status, type, location_id, tags,
           category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
         ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW(), NOW(), 0, 0)`,
        [randomUUID(), post.userId, post.title, post.content, post.type, post.location?.id ?? null, post.tags,
          post.categoryId, post.conditionLevel],
      );
      const postId = result.insertId;
      await connection.query("INSERT INTO items (post_id, title, quantity, created_at, updated_at) VALUES ?", [
        post.items.map((item) => [postId, item.title, item.quantity, new Date(), new Date()]),
      ]);
      const serial = String(unit.index + 1).padStart(4, "0");
      const stagingKeys = Array.from({ length: unit.images }, (_, i) => `staging/posts/benchmark-${runId}-${serial}-${i + 1}.jpg`);
      const s3Keys = Array.from({ length: unit.images }, (_, i) => `posts/benchmark-${runId}-${serial}-${i + 1}.webp`);
      await connection.query("INSERT INTO images (post_id, s3_key, alt_text, created_at) VALUES ?", [
        s3Keys.map((key) => [postId, key, `Image for post ${postId}`, new Date()]),
      ]);
      posts.push({ unit, postId, stagingKeys, s3Keys });
    }
    await connection.commit();
    return posts;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createPosterSessions(stores: AppStores, count: number) {
  const { createBenchmarkSessions } = await import("../feed/sessions");
  // 以編號最大的使用者發文，與 feed persona（編號最小）錯開
  const [users] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT id, public_id, username, email, avatar_url, created_at FROM users ORDER BY id DESC LIMIT ?",
    [count],
  );
  const [locations] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT place_id, full_address, province, city, lat, lng FROM locations ORDER BY id LIMIT ?",
    [count],
  );
  const sessionIds = await createBenchmarkSessions(
    stores.cacheRedis,
    users.map((user) => ({
      id: Number(user.id),
      public_id: String(user.public_id),
      username: String(user.username),
      email: String(user.email),
      avatar_url: user.avatar_url ? String(user.avatar_url) : null,
      created_at: new Date(user.created_at),
    })),
  );
  return sessionIds.map((sessionId, index) => {
    const location = locations[index % locations.length];
    return {
      sessionId,
      location: {
        place_id: String(location.place_id),
        full_address: String(location.full_address),
        province: String(location.province),
        city: String(location.city),
        lat: Number(location.lat),
        lng: Number(location.lng),
      },
    };
  });
}
