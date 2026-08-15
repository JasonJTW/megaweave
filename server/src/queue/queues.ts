// server/src/queue/queues.ts
// 職責：建立所有 Queue 實例，提供 enqueue helpers 給 route handlers 使用
//* producer

import { Queue } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";
import { PostEmbeddingJobData } from "./jobs/postEmbedding";

import { EmailTemplateProps } from "../emails/EmailTemplate";

export const postImageQueue = new Queue<
  PostUploadImageJobData | PostDeleteImageJobData
>("post-image", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export async function enqueuePostUploadImages(
  data: PostUploadImageJobData,
): Promise<void> {
  await postImageQueue.add("upload-images", data, { delay: 100 });
  console.log(`🖼️ Enqueued upload images job for post #${data.postId}`);
}

export async function enqueuePostDeleteImages(
  data: PostDeleteImageJobData,
): Promise<void> {
  await postImageQueue.add("delete-images", data);
  console.log(`🗑️ Enqueued delete images job for ${data.s3Keys.length} files`);
}

export const emailQueue = new Queue<EmailTemplateProps>("email", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60, // 7 days in seconds
      count: 1000, // keep at most 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // 7 days in seconds
    },
  },
});

export async function enqueueSendEmail(
  data: EmailTemplateProps,
): Promise<void> {
  await emailQueue.add("send-email", data);
  console.log(`📧 Enqueued email job for ${data.toEmail}`);
}

//* ─── Embedding Queue ─────────────────────────────────────────────────────────

export const embeddingQueue = new Queue<PostEmbeddingJobData>(
  "post-embedding",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  },
);

export async function enqueuePostEmbedding(
  data: PostEmbeddingJobData,
): Promise<void> {
  await embeddingQueue.add("generate-embedding", data, { delay: 500 });
  console.log(`🧠 Enqueued embedding job for post #${data.postId}`);
}
