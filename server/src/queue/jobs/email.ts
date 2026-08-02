// server/src/queue/jobs/email.ts
// 職責：定義 EmailJob 的資料型別 + 實際處理邏輯

import { Job } from "bullmq";

export interface EmailJobData {
  to: string;
  subject: string;
  body: string;
}

/** Worker 執行的處理邏輯 */
export async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, body } = job.data;

  console.log(`\n✉️  Processing job [${job.id}]`);
  console.log(`   To:      ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body:    ${body}`);

  // TODO: 換成真實寄信邏輯，例如：
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({ from: "no-reply@megaweaving.net", to, subject, html: body });

  console.log(`✅ Job [${job.id}] completed\n`);
}
