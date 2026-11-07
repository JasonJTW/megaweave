// 一次性回填：替 Redis 向量索引裡既有的 post:* hash 依 MySQL 補上 `scope` TAG（ADR 0003）。
// 冪等，可重跑。索引缺 scope 欄位時 ensureVectorIndexExists 會先以 FT.ALTER 補上（開機時也會自動回填一次）。
// 用法：npm run backfill:vector-scopes（讀 .env.development；正式環境以 dotenv -e 指定對應的 env 檔）
import { connectRedis, disconnectRedis, getVectorRedisClient } from "../utils/redis";
import dbPool, { closeDatabase } from "../utils/db";
import { ensureVectorIndexExists } from "../services/vectorIndexService";
import { backfillPostVectorScopes } from "../services/postVectorScope";

async function main() {
  let exitCode = 0;
  try {
    await connectRedis();
    await ensureVectorIndexExists();
    const { scanned, updated } = await backfillPostVectorScopes(
      dbPool,
      getVectorRedisClient(),
    );
    console.log(
      `✅ Vector scope backfill done: ${scanned} post(s) scanned, ${updated} hash(es) updated.`,
    );
  } catch (error) {
    console.error("❌ Vector scope backfill failed:", error);
    exitCode = 1;
  } finally {
    await disconnectRedis();
    await closeDatabase();
  }
  process.exit(exitCode);
}

main();
