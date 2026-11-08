// server/src/scripts/e2eSeed.ts
// npm run e2e:seed：重置 E2E 隔離環境並建立測試帳號（需先 make e2e-up）。

import { openAppStores } from "../isolation/appStores";
import { assertIsolatedMysql } from "../isolation/dataStoreGuard";
import { resetAndSeedE2e, resolveE2eUser } from "../e2e/seed";
import { resolveOrgViewer, seedOrgIsolationFixture } from "../e2e/orgIsolationFixture";
import { seedOrgHandoverFixture } from "../e2e/orgHandoverFixture";
import { seedOrgAutoReleaseFixture } from "../e2e/orgAutoReleaseFixture";
import { processCalculateHotScore } from "../queue/jobs/hotScore";

async function main(): Promise<void> {
  const user = resolveE2eUser();
  const orgViewer = resolveOrgViewer();
  const stores = await openAppStores();
  const { default: IORedis } = await import("ioredis");
  const { bullmqConnection } = await import("../queue/connection");
  const queueRedis = new IORedis({ ...bullmqConnection, maxRetriesPerRequest: 1, lazyConnect: true });

  try {
    // 先確認 MySQL 標記再連 Redis：指向錯誤資料庫時立即失敗，不必等待 Redis 重連逾時
    await assertIsolatedMysql(stores.mysql);
    await stores.connectRedis();
    await queueRedis.connect();
    await resetAndSeedE2e(stores, queueRedis, user);
    await seedOrgIsolationFixture(stores.mysql, stores.vectorRedis, orgViewer);
    await seedOrgHandoverFixture(stores.mysql);
    await seedOrgAutoReleaseFixture(stores.mysql);
    // 建好 feed:trending，讓熱門排行路徑讀到 fixture（與排程 job 相同邏輯）
    await processCalculateHotScore();
    console.log(`✅ E2E environment reset; seeded ${user.email} and the org isolation, handover and auto release fixtures`);
  } finally {
    queueRedis.disconnect();
    await stores.close();
  }
}

main().catch((error) => {
  console.error("❌ E2E seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
