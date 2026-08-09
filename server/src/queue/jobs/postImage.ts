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
  const startMsg = `🖼️ [Worker] Processing ${files.length} image WebP compress & S3 uploads for post #${postId}`;
  console.log(startMsg);
  await job.log(startMsg);

  for (const file of files) {
    const segments = file.s3Key.split("/");
    const folder = segments[0];
    const fileName = segments.slice(1).join("/");

    try {
      let uploadBuffer: Buffer;
      if (file.tempPath && fs.existsSync(file.tempPath)) {
        try {
          // 先讀取真實的圖片 metadata（使用 libvips 魔術字節，無法被前端偽造）
          const meta = await sharp(file.tempPath).metadata();
          const isAlreadyOptimal =
            meta.format === "webp" &&
            (meta.width ?? Infinity) <= 1200 &&
            (meta.height ?? Infinity) <= 1200;

          if (isAlreadyOptimal) {
            // 前端已完成 WebP 壓縮且尺寸符合規格，直接讀取上傳，跳過 CPU 密集壓縮
            uploadBuffer = await fs.promises.readFile(file.tempPath);
            await job.log(
              `⚡ [sharp] Skipped compression (already WebP ${meta.width}×${meta.height}): ${file.tempPath}`,
            );
          } else {
            // 前端未壓縮（PNG/JPEG/超大尺寸）→ 後端執行 resize + WebP 轉換
            uploadBuffer = await sharp(file.tempPath)
              .resize(1200, 1200, {
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: 80 })
              .toBuffer();
            await job.log(
              `✅ [sharp] Compressed ${meta.format?.toUpperCase() ?? "unknown"} → WebP: ${file.tempPath}`,
            );
          }
        } catch (compressError) {
          const warnMsg = `⚠️ [Worker] sharp processing failed for ${file.tempPath}, uploading raw file`;
          console.warn(warnMsg, compressError);
          await job.log(warnMsg);
          uploadBuffer = await fs.promises.readFile(file.tempPath);
        }
      } else {
        const errorMsg = `Temporary file not found for upload: ${file.tempPath || "undefined"}`;
        await job.log(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      await defaultImageStorage.upload(
        uploadBuffer,
        folder,
        fileName,
        "image/webp",
      );
      await job.log(`✅ [S3] Uploaded ${file.s3Key}`);

      // 只有在上傳 S3 成功後才刪除本機臨時檔
      await fs.promises.unlink(file.tempPath).catch(() => {});
    } catch (uploadError) {
      const errMessage =
        uploadError instanceof Error
          ? uploadError.message
          : String(uploadError);
      const errMsg = `❌ [Worker] S3 upload failed for post #${postId}: ${errMessage}`;
      console.error(errMsg, uploadError);
      await job.log(errMsg);

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

  const finishMsg = `✅ [Worker] S3 upload finished for post #${postId}`;
  console.log(finishMsg);
  await job.log(finishMsg);
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
