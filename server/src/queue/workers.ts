// server/src/queue/workers.ts
// 職責：註冊並啟動所有 Worker，由 server.ts 呼叫一次

import { Worker, Job } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  processPostUploadImages,
  processPostDeleteImages,
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";
import { processSendEmail } from "./jobs/email";
import { EmailTemplateProps } from "../emails/EmailTemplate";

export function startWorkers(): void {
  const postImageWorker = new Worker(
    "post-image",
    async (job: Job<PostUploadImageJobData | PostDeleteImageJobData>) => {
      if (job.name === "upload-images") {
        await processPostUploadImages(job as Job<PostUploadImageJobData>);
      } else if (job.name === "delete-images") {
        await processPostDeleteImages(job as Job<PostDeleteImageJobData>);
      }
    },
    { connection: bullmqConnection },
  );

  postImageWorker.on("completed", (job) => {
    console.log(
      `🎉 [post-image] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  postImageWorker.on("failed", (job, err) => {
    console.error(
      `❌ [post-image] Job ${job?.id} (${job?.name}) failed:`,
      err.message,
    );
  });

  const emailWorker = new Worker<EmailTemplateProps>(
    "email",
    async (job: Job<EmailTemplateProps>) => {
      if (job.name === "send-email") {
        await processSendEmail(job);
      }
    },
    { connection: bullmqConnection },
  );

  emailWorker.on("completed", (job) => {
    console.log(
      `🎉 [email-wroker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  emailWorker.on("failed", (job, err) => {
    console.error(
      `❌ [email-wroker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
    );
  });

  console.log("🚀 All workers started");
}
