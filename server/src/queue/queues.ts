// server/src/queue/queues.ts
// 職責：建立所有 Queue 實例，提供 enqueue helpers 給 route handlers 使用
//* producer

import { Queue } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";

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
