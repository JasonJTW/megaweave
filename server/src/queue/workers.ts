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
import {
  processPostEmbedding,
  PostEmbeddingJobData,
} from "./jobs/postEmbedding";

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

  // ─── Embedding Worker ──────────────────────────────────────────────────
  const embeddingWorker = new Worker<PostEmbeddingJobData>(
    "post-embedding",
    async (job: Job<PostEmbeddingJobData>) => {
      if (job.name === "generate-embedding") {
        await processPostEmbedding(job);
      }
    },
    { connection: bullmqConnection, concurrency: 2 },
  );

  embeddingWorker.on("completed", (job) => {
    console.log(
      `🎉 [embedding-worker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  embeddingWorker.on("failed", (job, err) => {
    console.error(
      `❌ [embedding-worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
    );
  });

  console.log("🚀 All workers started");
}
