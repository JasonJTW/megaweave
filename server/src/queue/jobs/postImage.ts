// server/src/queue/jobs/postImage.ts
import { Job } from "bullmq";
import { defaultImageStorage } from "../../storage/ImageStorage";

export interface PostUploadImageJobData {
  postId: number;
  files: Array<{
    s3Key: string;
    bufferBase64: string;
  }>;
}

export interface PostDeleteImageJobData {
  s3Keys: string[];
}

export async function processPostUploadImages(
  job: Job<PostUploadImageJobData>,
): Promise<void> {
  const { postId, files } = job.data;
  console.log(
    `🖼️ [Worker] Processing ${files.length} image S3 uploads for post #${postId}`,
  );

  for (const file of files) {
    const buffer = Buffer.from(file.bufferBase64, "base64");
    // s3Key 格式為 "posts/filename.webp"，取出資料夾與檔名
    const segments = file.s3Key.split("/");
    const folder = segments[0];
    const fileName = segments.slice(1).join("/");

    await defaultImageStorage.upload(buffer, folder, fileName);
  }

  console.log(`✅ [Worker] S3 upload finished for post #${postId}`);
}

export async function processPostDeleteImages(
  job: Job<PostDeleteImageJobData>,
): Promise<void> {
  const { s3Keys } = job.data;
  if (!s3Keys || s3Keys.length === 0) return;

  console.log(`🗑️ [Worker] Processing deletion of ${s3Keys.length} S3 files`);
  await defaultImageStorage.delete(s3Keys);
  console.log(`✅ [Worker] Deleted S3 files:`, s3Keys);
}
