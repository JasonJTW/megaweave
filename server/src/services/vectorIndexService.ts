import { getVectorRedisClient } from "../utils/redis";

/**
 * 確保 Redis Vector Index (idx:posts_v) 存在。
 * 若不存在則自動建立 HNSW 向量索引。
 *
 * 注意：@redis/client v5 不內建 .ft 命名空間，
 * 改用 sendCommand 直接執行 FT.INFO / FT.CREATE 原始命令。
 */
export async function ensureVectorIndexExists(): Promise<void> {
  const redis = getVectorRedisClient();

  try {
    // 檢查索引是否已經存在
    await redis.sendCommand(["FT.INFO", "idx:posts_v"]);
    console.log("✅ Redis Vector Index (idx:posts_v) is ready.");
  } catch (err: unknown) {
    const error = err as Error;
    const errorMsg = (error?.message || String(err)).toLowerCase();
    if (
      errorMsg.includes("unknown index name") ||
      errorMsg.includes("not found")
    ) {
      console.log("⚙️  Creating Redis Vector Index (idx:posts_v)...");
      try {
        // FT.CREATE idx:posts_v ON HASH PREFIX 1 post:
        //   SCHEMA
        //     v       VECTOR HNSW 8 TYPE FLOAT32 DIM 1536 DISTANCE_METRIC COSINE
        //     post_id NUMERIC
        //     status  TAG
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
      } catch (createErr) {
        console.error("❌ Failed to create Redis vector index:", createErr);
      }
    } else {
      console.error("⚠️  Error checking Redis vector index:", err);
    }
  }
}
