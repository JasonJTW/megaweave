import { Job } from "bullmq";
import { RESP_TYPES } from "@redis/client";
import { getRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Redis Set：記錄哪些 userId 的向量已更新、待寫入 MySQL */
const DIRTY_SET_KEY = "user:vector:dirty";

/**
 * 單次 flush 最多處理幾個 userId。
 * 防止 dirty set 積壓過多時一次打爆 MySQL。
 */
const FLUSH_BATCH_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 從 Redis user:{userId}:vector 讀取 FLOAT32 LE Buffer，解碼為 number[]。
 * 回傳 null 代表 Redis 尚無此向量（理論上不應發生，因為先寫 Redis 才標 dirty）。
 */
async function fetchUserVectorFromRedis(
  userId: number,
): Promise<number[] | null> {
  const redis = getRedisClient();
  try {
    const raw = await redis.sendCommand<Buffer | null>(
      ["HGET", `user:${userId}:vector`, "v"],
      {
        typeMapping: {
          [RESP_TYPES.BLOB_STRING]: Buffer,
        },
      },
    );

    if (raw && Buffer.isBuffer(raw) && raw.length > 0) {
      const vec: number[] = [];
      for (let i = 0; i < raw.length; i += 4) {
        vec.push(raw.readFloatLE(i));
      }
      return vec;
    }
  } catch (err) {
    console.warn(
      `⚠️ [vector-flush] Failed to fetch user vector from Redis (user #${userId}):`,
      err,
    );
  }
  return null;
}

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Write-Back flush processor。
 *
 * 流程：
 * 1. 從 user:vector:dirty Set 取出最多 FLUSH_BATCH_SIZE 個 userId（SPOP）
 * 2. 對每個 userId 從 Redis 讀取最新向量
 * 3. 批次 INSERT ... ON DUPLICATE KEY UPDATE 寫入 MySQL
 * 4. 若個別 userId 在 Redis 找不到向量，記錄警告並跳過（不影響其他人）
 */
export async function processUserVectorFlush(
  job: Job,
): Promise<{ flushedCount: number }> {
  const logPrefix = "🗄️ [vector-flush]";
  await job.log(`${logPrefix} start`);

  const redis = getRedisClient();

  // 1. 原子性地從 dirty set 取出一批 userId
  // 使用 sendCommand 直接呼叫 SPOP key count，確保回傳型別為 string[]
  const members = await redis.sendCommand<string[]>(
    ["SPOP", DIRTY_SET_KEY, String(FLUSH_BATCH_SIZE)],
  );
  if (!members || members.length === 0) {
    await job.log(`${logPrefix} – skip: dirty set empty`);
    return { flushedCount: 0 };
  }

  const userIds: number[] = members.map((m) => Number(m));
  await job.log(`${logPrefix} – flushing ${userIds.length} users`);

  // 2. 並行讀取 Redis 向量（各自獨立，失敗不影響他人）
  const rows: Array<{ userId: number; vec: number[] }> = [];
  await Promise.all(
    userIds.map(async (userId) => {
      const vec = await fetchUserVectorFromRedis(userId);
      if (!vec) {
        console.warn(
          `${logPrefix} – user #${userId}: vector not found in Redis, skipping`,
        );
        return;
      }
      rows.push({ userId, vec });
    }),
  );

  if (rows.length === 0) {
    console.warn(`${logPrefix} – no valid vectors to write`);
    await job.log(`${logPrefix} – skip: no valid vectors`);
    return { flushedCount: 0 };
  }

  // 3. 批次 INSERT ... ON DUPLICATE KEY UPDATE（單一 SQL，減少 round-trips）
  //    使用 user_profiles 的 user_id 作為 PK/UNIQUE，
  //    衝突時更新 interest_vector 和 vector_updated_at。
  const now = new Date();
  const placeholders = rows.map(() => "(?, ?, ?)").join(", ");
  const values: Array<number | string | Date> = [];
  for (const { userId, vec } of rows) {
    values.push(userId, JSON.stringify(vec), now);
  }

  await dbPool.execute(
    `INSERT INTO user_profiles (user_id, interest_vector, vector_updated_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       interest_vector   = VALUES(interest_vector),
       vector_updated_at = VALUES(vector_updated_at)`,
    values,
  );

  await job.log(`${logPrefix} done ✅ (${rows.length} rows flushed)`);
  return { flushedCount: rows.length };
}
