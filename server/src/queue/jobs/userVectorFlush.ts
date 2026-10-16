import { Job } from "bullmq";
import { RESP_TYPES } from "@redis/client";
import { getVectorRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Redis Set：記錄哪些 userId 的向量已更新、待寫入 MySQL */
const DIRTY_SET_KEY = "user:vector:dirty";

/**
 * 單次 flush 最多處理幾個 userId。
 * 防止 dirty set 積壓過多時一次打爆 MySQL。
 */
const FLUSH_BATCH_SIZE = 500;

/**
 * Redis Set：本輪 flush 已從 dirty 取出、但尚未確認寫入 MySQL 的 userId。
 * 寫入成功才 SREM；job 失敗或 process 當機時留在這裡，下一輪併回 dirty。
 */
const PROCESSING_SET_KEY = "user:vector:processing";

/**
 * 原子地「撿回上一輪殘留 → 取出一批 → 搬進 processing」。
 * 三步在同一個 Lua script 內完成，中間不會被其他指令插入，
 * 也不會出現 SPOP 完就當機、id 憑空消失的情況。
 *
 * KEYS[1] = dirty set、KEYS[2] = processing set、ARGV[1] = batch size
 * 依賴 flush worker concurrency = 1：多個 flush 同時跑會互相撿走對方的 processing。
 */
const CLAIM_BATCH_SCRIPT = `
redis.call('SUNIONSTORE', KEYS[1], KEYS[1], KEYS[2])
redis.call('DEL', KEYS[2])
local ids = redis.call('SPOP', KEYS[1], ARGV[1])
if #ids > 0 then
  redis.call('SADD', KEYS[2], unpack(ids))
end
return ids
`;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * 從 Redis user:{userId}:vector 讀取 FLOAT32 LE Buffer，解碼為 number[]。
 * 回傳 null 代表 Redis 尚無此向量（理論上不應發生，因為先寫 Redis 才標 dirty）。
 * Redis 錯誤會直接丟出，由呼叫端決定是否留在 processing 等下一輪重試。
 */
async function fetchUserVectorFromRedis(
  userId: number,
): Promise<number[] | null> {
  const redis = getVectorRedisClient();
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
  return null;
}

/**
 * 從 processing set 移除已處理完的 userId。
 * SREM 失敗不丟錯：MySQL 已寫入，殘留的 id 下一輪會被冪等地重寫一次。
 */
async function releaseProcessing(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await getVectorRedisClient().sRem(PROCESSING_SET_KEY, userIds.map(String));
  } catch (err) {
    console.warn(
      `⚠️ [vector-flush] Failed to release processing users: ${userIds.join(",")}`,
      err,
    );
  }
}

// ─── Processor ─────────────────────────────────────────────────────────────

/**
 * Write-Back flush processor。
 *
 * 流程：
 * 1. CLAIM_BATCH_SCRIPT：processing 殘留併回 dirty，再搬最多 FLUSH_BATCH_SIZE 個到 processing
 * 2. 對每個 userId 從 Redis 讀取最新向量
 * 3. 批次 INSERT ... ON DUPLICATE KEY UPDATE 寫入 MySQL
 * 4. 若個別 userId 在 Redis 找不到向量，記錄警告並跳過（不影響其他人）
 * 5. 已寫入／確認無向量的 userId 從 processing SREM
 *
 * 失敗處理（reliable queue：成功才刪）：
 * - 個別 HGET 失敗 → 該 userId 留在 processing，下一輪重試，其他人照常寫入
 * - MySQL 寫入失敗或 process 當機 → 整批留在 processing，BullMQ 重試／下一輪 cron 撿回
 * 寫入是 ON DUPLICATE KEY UPDATE（冪等），重寫安全。
 */
export async function processUserVectorFlush(
  job: Job,
): Promise<{ flushedCount: number }> {
  const logPrefix = "🗄️ [vector-flush]";
  await job.log(`${logPrefix} start`);

  const redis = getVectorRedisClient();

  // 1. 原子性地把一批 userId 從 dirty 搬到 processing
  // 使用 sendCommand 直接呼叫 EVAL，確保回傳型別為 string[]
  const members = await redis.sendCommand<string[]>([
    "EVAL",
    CLAIM_BATCH_SCRIPT,
    "2",
    DIRTY_SET_KEY,
    PROCESSING_SET_KEY,
    String(FLUSH_BATCH_SIZE),
  ]);
  if (!members || members.length === 0) {
    await job.log(`${logPrefix} – skip: dirty set empty`);
    return { flushedCount: 0 };
  }

  const userIds: number[] = members.map((m) => Number(m));
  await job.log(`${logPrefix} – flushing ${userIds.length} users`);

  // 2. 並行讀取 Redis 向量（各自獨立，失敗不影響他人）
  const rows: Array<{ userId: number; vec: number[] }> = [];
  const missingIds: number[] = [];
  await Promise.all(
    userIds.map(async (userId) => {
      let vec: number[] | null;
      try {
        vec = await fetchUserVectorFromRedis(userId);
      } catch (err) {
        console.warn(
          `${logPrefix} – user #${userId}: failed to fetch vector from Redis, retry next run`,
          err,
        );
        return;
      }
      if (!vec) {
        console.warn(
          `${logPrefix} – user #${userId}: vector not found in Redis, skipping`,
        );
        missingIds.push(userId);
        return;
      }
      rows.push({ userId, vec });
    }),
  );

  if (rows.length === 0) {
    await releaseProcessing(missingIds);
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

  // 失敗直接丟出：整批留在 processing，BullMQ 重試時由 CLAIM_BATCH_SCRIPT 併回 dirty
  await dbPool.execute(
    `INSERT INTO user_profiles (user_id, interest_vector, vector_updated_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       interest_vector   = VALUES(interest_vector),
       vector_updated_at = VALUES(vector_updated_at)`,
    values,
  );

  // 5. 成功才從 processing 移除；HGET 失敗的 userId 留著，下一輪重試
  await releaseProcessing([...rows.map((r) => r.userId), ...missingIds]);

  await job.log(`${logPrefix} done ✅ (${rows.length} rows flushed)`);
  return { flushedCount: rows.length };
}
