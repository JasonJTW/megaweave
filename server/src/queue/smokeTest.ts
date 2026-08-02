// server/src/queue/smokeTest.ts
//
// 快速驗證 BullMQ 是否正常運作（Worker + Queue 一起跑）：
//   npx dotenv -e .env.development -- npx ts-node src/queue/smokeTest.ts

import { enqueueEmail, emailQueue } from "./queues";
import { startWorkers } from "./workers";

async function main() {
  // 在同一個 process 啟動 worker，方便獨立驗證
  startWorkers();

  console.log("🧪 BullMQ smoke test — enqueuing 3 jobs...\n");

  await enqueueEmail({ to: "alice@example.com", subject: "Test #1", body: "Body 1" });
  await enqueueEmail({ to: "bob@example.com",   subject: "Test #2", body: "Body 2" });
  await enqueueEmail({ to: "carol@example.com", subject: "Test #3", body: "Body 3" });

  const counts = await emailQueue.getJobCounts();
  console.log("\n📊 Queue stats:", counts);

  // 等 worker 處理完後再退出
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await emailQueue.close();
  console.log("\n✅ smokeTest done");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ smokeTest failed:", err);
  process.exit(1);
});
