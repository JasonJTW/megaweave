// server/src/queue/queues.ts
// 職責：建立所有 Queue 實例，提供 enqueue helpers 給 route handlers 使用

import { Queue } from "bullmq";
import { bullmqConnection } from "./connection";
import { EmailJobData } from "./jobs/email";

export const emailQueue = new Queue<EmailJobData>("email", {
  connection: bullmqConnection,
});

/** Route handler 呼叫這個來排入 email 任務 */
export async function enqueueEmail(data: EmailJobData): Promise<void> {
  await emailQueue.add("send-email", data);
  console.log(`📨 Enqueued email to: ${data.to}`);
}

// 未來新增其他 Queue 也放在這裡，例如：
// export const notificationQueue = new Queue<NotificationJobData>("notification", { connection: bullmqConnection });
// export async function enqueueNotification(data: NotificationJobData) { ... }
