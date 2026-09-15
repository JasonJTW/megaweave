// server/src/queue/jobs/postEmbedding.ts
// Job 型別定義 + Processor：呼叫 OpenAI 生成貼文向量並寫入 Redis & MySQL

import { Job } from "bullmq";
import OpenAI from "openai";
import { RowDataPacket } from "mysql2";
import { getVectorRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { generatePostText } from "../../utils/generatePostText";
import { PostTextInput } from "../../types/post";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Configuration Error: Missing OPENAI_API_KEY environment variable.");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

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

/**
 * 呼叫 OpenAI text-embedding-3-small，回傳 FLOAT32 向量 Buffer 與原始 number[] 向量數值。
 * 使用 openai SDK：自動處理 auth、rate-limit retry、完整型別。
 */
export async function fetchEmbedding(text: string): Promise<{
  buffer: Buffer;
  vector: number[];
  dimensions: number;
  byteLength: number;
}> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  console.log("embeddings result: ", response);

  const vector = response.data[0].embedding; // number[], length = 1536

  // Redis 的 VECTOR 欄位需要 raw FLOAT32 binary（小端序）
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return {
    buffer,
    vector,
    dimensions: vector.length,
    byteLength: buffer.length,
  };
}

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
