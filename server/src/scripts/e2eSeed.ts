// server/src/scripts/e2eSeed.ts
// npm run e2e:seed：重置 E2E 隔離環境並建立測試帳號（需先 make e2e-up）。

import { assertBenchmarkMysql } from "../benchmark/fixture/dataStoreGuard";
import { openAppStores } from "../benchmark/fixture/fixtureProfile";
import { resetAndSeedE2e, resolveE2eUser } from "../e2e/seed";

async function main(): Promise<void> {
  const user = resolveE2eUser();
  const stores = await openAppStores();
  const { default: IORedis } = await import("ioredis");
  const { bullmqConnection } = await import("../queue/connection");
  const queueRedis = new IORedis({ ...bullmqConnection, maxRetriesPerRequest: 1, lazyConnect: true });

  try {
    // 先確認 MySQL 標記再連 Redis：指向錯誤資料庫時立即失敗，不必等待 Redis 重連逾時
    await assertBenchmarkMysql(stores.mysql);
    await stores.connectRedis();
    await queueRedis.connect();
    await resetAndSeedE2e(stores, queueRedis, user);
    console.log(`✅ E2E environment reset; seeded ${user.email}`);
  } finally {
    queueRedis.disconnect();
    await stores.close();
  }
}

main().catch((error) => {
  console.error("❌ E2E seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
