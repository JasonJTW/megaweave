// server/src/queue/workers.ts
// 職責：註冊並啟動所有 Worker，由 server.ts 呼叫一次

import { Worker } from "bullmq";
import { bullmqConnection } from "./connection";
import { processEmail } from "./jobs/email";

export function startWorkers(): void {
  const emailWorker = new Worker("email", processEmail, {
    connection: bullmqConnection,
  });

  emailWorker.on("completed", (job) => {
    console.log(`🎉 [email] Job ${job.id} finished successfully`);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(`❌ [email] Job ${job?.id} failed:`, err.message);
  });

  console.log("🚀 All workers started");

  // 未來新增 Worker 也放在這裡，例如：
  // const notificationWorker = new Worker("notification", processNotification, { connection: bullmqConnection });
}
