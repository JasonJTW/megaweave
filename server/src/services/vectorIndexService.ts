import { getRedisClient } from "../utils/redis";

/**
 * 確保 Redis Vector Index (idx:posts_v) 存在。
 * 若不存在則自動建立 HNSW 向量索引。
 */
export async function ensureVectorIndexExists(): Promise<void> {
  const redis = getRedisClient();

  try {
    // 檢查索引是否已經存在
    await (redis as unknown as { ft: { info: (name: string) => Promise<unknown>; create: (...args: unknown[]) => Promise<unknown> } }).ft.info("idx:posts_v");
    console.log("✅ Redis Vector Index (idx:posts_v) is ready.");
  } catch (err: unknown) {
    const error = err as Error;
    const errorMsg = error?.message || String(err);
    if (errorMsg.includes("Unknown Index name") || errorMsg.includes("not found")) {
      console.log("⚙️  Creating Redis Vector Index (idx:posts_v)...");
      try {
        await (redis as unknown as { ft: { create: (...args: unknown[]) => Promise<unknown> } }).ft.create(
          "idx:posts_v",
          {
            v: {
              type: "VECTOR",
              ALGORITHM: "HNSW",
              TYPE: "FLOAT32",
              DIM: 1536,
              DISTANCE_METRIC: "COSINE",
            },
            post_id: {
              type: "NUMERIC",
            },
            status: {
              type: "TAG",
            },
          },
          {
            ON: "HASH",
            PREFIX: "product:",
          }
        );
        console.log("🚀 Redis Vector Index (idx:posts_v) created successfully!");
      } catch (createErr) {
        console.error("❌ Failed to create Redis vector index:", createErr);
      }
    } else {
      console.error("⚠️  Error checking Redis vector index:", err);
    }
  }
}
