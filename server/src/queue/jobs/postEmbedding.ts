// server/src/queue/jobs/postEmbedding.ts
// Job 型別定義 + Processor：呼叫 OpenAI 生成貼文向量並寫入 Redis & MySQL

import { Job } from "bullmq";
import { RowDataPacket } from "mysql2";
import { getVectorRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { generatePostText } from "../../utils/generatePostText";
import { PostTextInput } from "../../types/post";
import { fetchEmbedding } from "../../services/embeddingService";

export { fetchEmbedding } from "../../services/embeddingService";

// ─── Metadata In-Memory Cache (0 DB query on hot cache) ─────────────────────
let categoryCache: Map<number, string> | null = null;
let conditionCache: Map<number, string> | null = null;
let lastCategoryCacheTime = 0;
let lastConditionCacheTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時快取刷新（分類與狀況為低頻變動的靜態字典）

async function getCategoryName(categoryId: number): Promise<string | undefined> {
  const now = Date.now();
  const isExpired = now - lastCategoryCacheTime > CACHE_TTL_MS;
  const isMissing = categoryCache && !categoryCache.has(categoryId);

  if (!categoryCache || isExpired || isMissing) {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT id, name, name_en FROM categories WHERE status = 'active'",
    );
    categoryCache = new Map<number, string>();
    for (const row of rows) {
      categoryCache.set(
        row.id,
        (row.name_en as string) || (row.name as string),
      );
    }
    lastCategoryCacheTime = now;
  }
  return categoryCache.get(categoryId);
}

async function getConditionName(
  conditionLevel: number,
): Promise<string | undefined> {
  const now = Date.now();
  const isExpired = now - lastConditionCacheTime > CACHE_TTL_MS;
  const isMissing = conditionCache && !conditionCache.has(conditionLevel);

  if (!conditionCache || isExpired || isMissing) {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT level, name FROM conditions WHERE status = 'active'",
    );
    conditionCache = new Map<number, string>();
    for (const row of rows) {
      conditionCache.set(row.level, row.name as string);
    }
    lastConditionCacheTime = now;
  }
  return conditionCache.get(conditionLevel);
}

// ─── Job Payload ─────────────────────────────────────────────────────────────

export interface PostEmbeddingJobData {
  postId: number;
  post: PostTextInput;
}

// ─── OpenAI Embedding ────────────────────────────────────────────────────────

// ─── Processor ───────────────────────────────────────────────────────────────

export async function processPostEmbedding(
  job: Job<PostEmbeddingJobData>,
): Promise<void> {
  const { postId, post } = job.data;
  const logPrefix = `🧠 [embedding-worker] post #${postId}`;

  await job.log(`${logPrefix} start`);
  console.log(`${logPrefix} – generating embedding text...`);

  // 1. 由記憶體快取解析分類與狀況名稱（categoryId / conditionLevel → 文字）
  const category_name = await getCategoryName(post.categoryId);
  const condition_name = await getConditionName(post.conditionLevel);

  // 2. 組裝向量文字
  const text = generatePostText({
    title: post.title,
    content: post.content,
    type: post.type,
    category_name,
    condition_name,
    tags: post.tags,
    items: post.items,
    city: post.city,
    province: post.province,
  });
  await job.log(`${logPrefix} text:\n${text}`);

  // 3. 呼叫 OpenAI
  const { buffer: vectorBuffer } = await fetchEmbedding(text);
  await job.log(
    `${logPrefix} embedding received (${vectorBuffer.length} bytes)`,
  );

  // 4. 寫入 Redis 向量索引實例
  //    key 格式必須與 vectorIndexService PREFIX 一致：post:{id}
  const redis = getVectorRedisClient();
  await redis.hSet(`post:${postId}`, {
    v: vectorBuffer,
    post_id: postId,
    status: post.type, // TAG 欄位，方便後續依類型過濾
  });
  console.log(`${logPrefix} – Redis HSET post:${postId} done`);

  // 5. 持久化到 MySQL（JSON 格式，供冷啟動或重建索引使用）
  const vectorJson = JSON.stringify(
    Array.from(new Float32Array(vectorBuffer.buffer)),
  );
  await dbPool.execute("UPDATE posts SET embedding = ? WHERE id = ?", [
    vectorJson,
    postId,
  ]);
  console.log(`${logPrefix} – MySQL embedding saved`);

  await job.log(`${logPrefix} done ✅`);
}
