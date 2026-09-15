import path from "path";
import dotenv from "dotenv";
import { connectRedis, disconnectRedis } from "../utils/redis";
import { ensureVectorIndexExists, syncVectorsFromMySQL } from "../services/vectorIndexService";

// 載入環境變數
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

async function main() {
  console.log("🚀 Starting Vector Sync: MySQL -> Redis Vector (idx:posts_v)...");
  try {
    await connectRedis();
    await ensureVectorIndexExists();
    const synced = await syncVectorsFromMySQL();
    console.log(`🎉 Vector sync completed successfully! Total synced: ${synced}`);
  } catch (error) {
    console.error("❌ Vector sync failed:", error);
    process.exit(1);
  } finally {
    await disconnectRedis();
    process.exit(0);
  }
}

main();
