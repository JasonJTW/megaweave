import { Job } from "bullmq";
import { RESP_TYPES } from "@redis/client";
import { getRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { RowDataPacket } from "mysql2";

// ─── 行為權重 ──────────────────────────────────────────────────────────────────

export type UserActionType = "view" | "like" | "comment" | "weave";

const ACTION_WEIGHTS: Record<UserActionType, number> = {
  view: 0.05,
  like: 0.2,
  comment: 0.4,
  weave: 0.8,
};

// EMA alpha = 行為對應的 α，越強的行為讓新商品向量佔比越高
// V_user_new = Normalize((1 - α) * V_user_old + α * V_product)

// ─── Job Payload ──────────────────────────────────────────────────────────────

export interface UserVectorJobData {
  userId: number;
  postId: number;
  action: UserActionType;
}

// ─── 向量輔助函式 ─────────────────────────────────────────────────────────────

/**
 * 將 number[] 向量正規化為單位向量 (L2 norm)。
 * 若向量為全零（冷啟動）則直接回傳，避免 NaN。
 */
function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * 將 number[] 轉為 Redis VECTOR 欄位所需的 FLOAT32 LE Buffer。
 */
function toFloat32Buffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i], i * 4);
  }
  return buf;
}

/**
 * 從 Redis Hash 讀取 post:{postId} 的向量 Buffer，解碼為 number[]。
 * 若 Redis 尚未存入，則自動 fallback 從 MySQL posts.embedding 讀取。
 *
 * 注意：@redis/client v5 預設將 BLOB_STRING 解碼為 string，
 * 需在 sendCommand 傳入 typeMapping: { [RESP_TYPES.BLOB_STRING]: Buffer } 才能取得 Buffer。
 */
async function fetchPostVector(postId: number): Promise<number[] | null> {
  const redis = getRedisClient();
  try {
    const raw = await redis.sendCommand<Buffer | null>(
      ["HGET", `post:${postId}`, "v"],
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
    console.warn(`⚠️ Failed to fetch post vector from Redis (post #${postId}):`, err);
  }

  // Fallback: 從 MySQL posts.embedding 讀取
  try {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT embedding FROM posts WHERE id = ?",
      [postId],
    );
    if (rows.length > 0 && rows[0].embedding) {
      const dbVec = rows[0].embedding;
      return typeof dbVec === "string" ? JSON.parse(dbVec) : (dbVec as number[]);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to fetch post vector from MySQL (post #${postId}):`, err);
  }

  return null;
}

/**
 * 取得使用者興趣向量：優先讀 Redis user:{userId}:vector，
 * Redis miss 才 fallback 讀 MySQL user_profiles.interest_vector。
 * 與 fetchPostVector 保持一致的 Redis-first 模式，確保讀到最新向量。
 */
async function fetchUserVector(
  userId: number,
): Promise<number[] | null> {
  const redis = getRedisClient();

  // 1. 先讀 Redis（worker 每次更新後都會 HSET 到這裡）
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
    console.warn(`⚠️ Failed to fetch user vector from Redis (user #${userId}):`, err);
  }

  // 2. Fallback：讀 MySQL user_profiles.interest_vector
  try {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT interest_vector FROM user_profiles WHERE user_id = ?",
      [userId],
    );
    if (rows.length === 0 || !rows[0].interest_vector) return null;

    const raw = rows[0].interest_vector;
    // MySQL JSON 欄位取出後已是 JS 物件，但型別不確定，統一用 JSON.parse 保險
    return typeof raw === "string" ? JSON.parse(raw) : (raw as number[]);
  } catch (err) {
    console.warn(`⚠️ Failed to fetch user vector from MySQL (user #${userId}):`, err);
  }

  return null;
}

// ─── Processor ────────────────────────────────────────────────────────────────

export async function processUserVector(
  job: Job<UserVectorJobData>,
): Promise<void> {
  const { userId, postId, action } = job.data;
  const logPrefix = `🧠 [user-vector-worker] user #${userId} ← post #${postId} (${action})`;

  await job.log(`${logPrefix} start`);
  console.log(`${logPrefix} – start`);

  // 1. 取得商品向量（若尚未 Embedding 則放棄本次更新，不拋錯）
  const postVec = await fetchPostVector(postId);
  if (!postVec) {
    console.warn(
      `${logPrefix} – post vector not found in Redis, skipping update`,
    );
    await job.log(`${logPrefix} – skip: post vector missing`);
    return;
  }
  const dim = postVec.length;

  // 2. 取得舊的使用者興趣向量（優先讀 Redis，miss 才讀 MySQL；新用戶 = null → 全零冷啟動）
  let userVec = await fetchUserVector(userId);
  if (!userVec) {
    console.log(`${logPrefix} – cold start: initializing user vector to zeros`);
    userVec = new Array<number>(dim).fill(0);
  }

  // 維度保護
  if (userVec.length !== dim) {
    console.warn(
      `${logPrefix} – dimension mismatch (user=${userVec.length}, post=${dim}), reinitializing`,
    );
    userVec = new Array<number>(dim).fill(0);
  }

  // 3. EMA 更新
  //    V_new = Normalize((1 - α) * V_old + α * V_product)
  const alpha = ACTION_WEIGHTS[action];
  const blended = userVec.map((v, i) => (1 - alpha) * v + alpha * postVec[i]);
  const newUserVec = normalizeVector(blended);

  await job.log(
    `${logPrefix} – EMA α=${alpha}, dim=${dim}, norm updated`,
  );

  // 4. 寫入 Redis  key: user:{userId}:vector
  const redis = getRedisClient();
  const redisKey = `user:${userId}:vector`;
  const vectorBuffer = toFloat32Buffer(newUserVec);
  await redis.hSet(redisKey, {
    v: vectorBuffer,
    user_id: userId,
    updated_at: Date.now(),
  });
  console.log(`${logPrefix} – Redis HSET ${redisKey} done`);

  // 5. 標記為 dirty，等待批次 flush job 寫入 MySQL
  //    採 Write-Back 模式：Redis 是即時 source of truth，
  //    MySQL 由 user-vector-flush cron 每隔 N 分鐘批次持久化，
  //    避免每個 job 都同步打一次 MySQL UPDATE。
  await redis.sAdd("user:vector:dirty", String(userId));
  console.log(`${logPrefix} – marked user #${userId} as dirty for batch flush`);

  await job.log(`${logPrefix} done ✅`);
}
