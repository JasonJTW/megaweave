import { RowDataPacket } from "mysql2";
import dbPool from "../utils/db";
import { getVectorRedisClient } from "../utils/redis";

/**
 * 解析 FT.INFO 回傳的鍵值陣列，安全取得 num_docs 數量
 */
export function getNumDocsFromFtInfo(rawInfo: unknown): number {
  if (!Array.isArray(rawInfo)) return 0;
  for (let i = 0; i < rawInfo.length; i += 2) {
    if (String(rawInfo[i]) === "num_docs") {
      const val = Number(rawInfo[i + 1]);
      return isNaN(val) ? 0 : val;
    }
  }
  return 0;
}

/**
 * 從 MySQL posts 資料表批次讀取既有的向量 (Float32 array) 並同步灌入 Redis 向量實例
 * 適用於冷啟動、開機自檢或運維手動同步
 */
export async function syncVectorsFromMySQL(): Promise<number> {
  const redis = getVectorRedisClient();
  let rows: RowDataPacket[] = [];

  try {
    const [dbRows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, type, embedding 
       FROM posts 
       WHERE embedding IS NOT NULL 
         AND deleted_at IS NULL 
       ORDER BY id ASC`,
    );
    rows = dbRows;
  } catch (dbErr) {
    console.warn("⚠️ Failed to query posts embeddings from MySQL:", dbErr);
    return 0;
  }

  if (!rows || rows.length === 0) {
    console.log("ℹ️ No post embeddings found in MySQL to sync.");
    return 0;
  }

  console.log(
    `📦 Found ${rows.length} post embedding(s) in MySQL. Syncing to Redis vector index...`,
  );

  let synced = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          let vector: number[] | null = null;
          if (typeof row.embedding === "string") {
            try {
              vector = JSON.parse(row.embedding);
            } catch {
              vector = null;
            }
          } else if (Array.isArray(row.embedding)) {
            vector = row.embedding;
          }

          if (!vector || !Array.isArray(vector) || vector.length === 0) {
            return;
          }

          const buffer = Buffer.alloc(vector.length * 4);
          for (let idx = 0; idx < vector.length; idx++) {
            buffer.writeFloatLE(vector[idx], idx * 4);
          }

          await redis.hSet(`post:${row.id}`, {
            v: buffer,
            post_id: row.id,
            status: row.type || "active",
          });
          synced++;
        } catch (itemErr) {
          console.warn(`⚠️ Failed to sync vector for post #${row.id}:`, itemErr);
        }
      }),
    );
  }

  console.log(
    `✅ Successfully synced ${synced} vector document(s) to Redis (idx:posts_v).`,
  );
  return synced;
}

/**
 * 開機自檢：當 Redis 向量索引為空 (num_docs = 0) 時，自動觸發 MySQL 向量回填
 * 使用分散式鎖避免多 instance 重複執行
 */
export async function autoSyncVectorsIfEmpty(): Promise<number> {
  const redis = getVectorRedisClient();
  try {
    const lockAcquired = await redis.set("lock:vector_boot_sync", "1", {
      NX: true,
      EX: 120,
    });

    if (!lockAcquired) {
      console.log(
        "ℹ️ Vector sync is already in progress by another instance, skipping.",
      );
      return 0;
    }

    try {
      console.log(
        "🔍 Redis vector index is empty. Performing boot-time self-check & restoring embeddings from MySQL...",
      );
      return await syncVectorsFromMySQL();
    } finally {
      try {
        await redis.del("lock:vector_boot_sync");
      } catch {
        // ignore unlock error
      }
    }
  } catch (err) {
    console.warn("⚠️ Error during autoSyncVectorsIfEmpty:", err);
    return 0;
  }
}

/**
 * 確保 Redis Vector Index (idx:posts_v) 存在。
 * 若不存在則自動建立 HNSW 向量索引。
 * 若索引已就緒但內容為空 (num_docs = 0)，自動從 MySQL 回填現有向量。
 */
export async function ensureVectorIndexExists(): Promise<void> {
  const redis = getVectorRedisClient();
  let indexReady = false;

  try {
    // 檢查索引是否存在
    const info = await redis.sendCommand(["FT.INFO", "idx:posts_v"]);
    console.log("✅ Redis Vector Index (idx:posts_v) is ready.");
    indexReady = true;

    const numDocs = getNumDocsFromFtInfo(info);
    if (numDocs === 0) {
      await autoSyncVectorsIfEmpty();
    }
  } catch (err: unknown) {
    const error = err as Error;
    const errorMsg = (error?.message || String(err)).toLowerCase();
    if (
      errorMsg.includes("unknown index name") ||
      errorMsg.includes("not found")
    ) {
      console.log("⚙️  Creating Redis Vector Index (idx:posts_v)...");
      try {
        await redis.sendCommand([
          "FT.CREATE",
          "idx:posts_v",
          "ON",
          "HASH",
          "PREFIX",
          "1",
          "post:",
          "SCHEMA",
          "v",
          "VECTOR",
          "HNSW",
          "6",
          "TYPE",
          "FLOAT32",
          "DIM",
          "1536",
          "DISTANCE_METRIC",
          "COSINE",
          "post_id",
          "NUMERIC",
          "status",
          "TAG",
        ]);
        console.log(
          "🚀 Redis Vector Index (idx:posts_v) created successfully!",
        );
        indexReady = true;
      } catch (createErr) {
        console.error("❌ Failed to create Redis vector index:", createErr);
      }

      if (indexReady) {
        await autoSyncVectorsIfEmpty();
      }
    } else {
      console.error("⚠️  Error checking Redis vector index:", err);
    }
  }
}
