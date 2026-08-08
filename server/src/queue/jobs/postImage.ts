import fs from "fs";
import sharp from "sharp";
import { Job } from "bullmq";
import { defaultImageStorage } from "../../storage/ImageStorage";

export interface PostUploadImageJobData {
  postId: number;
  files: Array<{
    s3Key: string;
    tempPath: string;
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
    `🖼️ [Worker] Processing ${files.length} image WebP compress & S3 uploads for post #${postId}`,
  );

  for (const file of files) {
    const segments = file.s3Key.split("/");
    const folder = segments[0];
    const fileName = segments.slice(1).join("/");

    try {
      let uploadBuffer: Buffer;
      if (file.tempPath && fs.existsSync(file.tempPath)) {
        try {
          // 使用 sharp 將圖片壓縮並轉換為 WebP 格式 (等比例 1200x1200, 品質 80)
          uploadBuffer = await sharp(file.tempPath)
            .resize(1200, 1200, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();
        } catch (compressError) {
          console.warn(
            `⚠️ [Worker] sharp compression failed for ${file.tempPath}, uploading raw file:`,
            compressError,
          );
          uploadBuffer = await fs.promises.readFile(file.tempPath);
        }
      } else {
        console.error(`❌ [Worker] Temporary file not found: ${file.tempPath}`);
        continue;
      }

      await defaultImageStorage.upload(
        uploadBuffer,
        folder,
        fileName,
        "image/webp",
      );

      // 只有在上傳 S3 成功後才刪除本機臨時檔
      await fs.promises.unlink(file.tempPath).catch(() => {});
    } catch (uploadError) {
      console.error(
        `❌ [Worker] S3 upload failed for post #${postId}, tempPath: ${file.tempPath}`,
        uploadError,
      );

      // 若已達到最大重試次數 (BullMQ 重試失敗)，清理臨時檔防止硬碟空間洩漏
      const maxAttempts = job.opts.attempts || 1;
      if (job.attemptsMade >= maxAttempts) {
        if (file.tempPath && fs.existsSync(file.tempPath)) {
          await fs.promises.unlink(file.tempPath).catch(() => {});
        }
      }
      throw uploadError; // 重新拋出錯誤讓 BullMQ 進行 Retry
    }
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
