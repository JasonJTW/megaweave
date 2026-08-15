// server/src/queue/jobs/postEmbedding.ts
// Job 型別定義 + Processor：呼叫 OpenAI 生成貼文向量並寫入 Redis & MySQL

import { Job } from "bullmq";
import OpenAI from "openai";
import { getRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { generatePostText, PostTextInput } from "../../utils/generatePostText";

//* 自動讀取 process.env.OPENAI_API_KEY
const openai = new OpenAI();

// ─── Job Payload ──────────────────────────────────────────────────────────────

export interface PostEmbeddingJobData {
  postId: number;
  post: PostTextInput;
}

// ─── OpenAI Embedding ─────────────────────────────────────────────────────────

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

// ─── Processor ────────────────────────────────────────────────────────────────

export async function processPostEmbedding(
  job: Job<PostEmbeddingJobData>,
): Promise<void> {
  const { postId, post } = job.data;
  const logPrefix = `🧠 [embedding-worker] post #${postId}`;

  await job.log(`${logPrefix} start`);
  console.log(`${logPrefix} – generating embedding text...`);

  // 1. 拼接文字
  const text = generatePostText(post);
  await job.log(`${logPrefix} text:\n${text}`);

  // 2. 呼叫 OpenAI
  const { buffer: vectorBuffer } = await fetchEmbedding(text);
  await job.log(
    `${logPrefix} embedding received (${vectorBuffer.length} bytes)`,
  );

  // 3. 寫入 Redis 向量索引
  //    key 格式必須與 vectorIndexService PREFIX 一致：post:{id}
  const redis = getRedisClient();
  await redis.hSet(`post:${postId}`, {
    v: vectorBuffer,
    post_id: postId,
    status: post.type, // TAG 欄位，方便後續依類型過濾
  });
  console.log(`${logPrefix} – Redis HSET post:${postId} done`);

  // 4. 持久化到 MySQL（JSON 格式，供冷啟動或重建索引使用）
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
