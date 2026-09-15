import fs from "fs";
import sharp from "sharp";
import { Job } from "bullmq";
import { defaultImageStorage } from "../../storage/ImageStorage";

export interface PostUploadImageJobData {
  postId: number;
  files: Array<{
    s3Key: string;
    tempPath?: string;
    stagingKey?: string;
  }>;
}

export interface PostDeleteImageJobData {
  s3Keys: string[];
}

async function waitForFile(filePath: string, maxWaitMs = 5000, intervalMs = 100): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return fs.existsSync(filePath);
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
      let rawBuffer: Buffer;

      if (file.stagingKey) {
        // 從 S3 Staging 下載原始檔案
        await job.log(`📥 [Worker] Fetching staging image from S3: ${file.stagingKey}`);
        rawBuffer = await defaultImageStorage.getObjectBuffer(file.stagingKey);
      } else if (file.tempPath) {
        const fileExists = await waitForFile(file.tempPath);
        if (!fileExists) {
          const errorMsg = `Temporary file not found for upload: ${file.tempPath}`;
          await job.log(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        rawBuffer = await fs.promises.readFile(file.tempPath);
      } else {
        const errorMsg = `Neither stagingKey nor tempPath provided for post #${postId}`;
        await job.log(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      try {
        // 讀取真實的圖片 metadata（使用 libvips 魔術字節，支援 iPhone raw/heic/jpeg/png 等格式）
        const meta = await sharp(rawBuffer).metadata();
        const isAlreadyOptimal =
          meta.format === "webp" &&
          (meta.width ?? Infinity) <= 1200 &&
          (meta.height ?? Infinity) <= 1200;

        if (isAlreadyOptimal) {
          // 已經是合規的 WebP，直接上傳，避免浪費 CPU
          uploadBuffer = rawBuffer;
          await job.log(
            `⚡ [sharp] Skipped compression (already WebP ${meta.width}×${meta.height})`,
          );
        } else {
          // 執行 resize + WebP 轉換 (解決 iPhone 原始圖或超大圖片問題)
          const origSizeKB = (rawBuffer.length / 1024).toFixed(1);
          uploadBuffer = await sharp(rawBuffer)
            .resize(1200, 1200, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();
          const compressedSizeKB = (uploadBuffer.length / 1024).toFixed(1);
          await job.log(
            `✅ [sharp] Compressed ${meta.format?.toUpperCase() ?? "unknown"} → WebP (${origSizeKB}KB → ${compressedSizeKB}KB)`,
          );
        }
      } catch (compressError) {
        const warnMsg = `⚠️ [Worker] sharp processing failed, uploading raw buffer`;
        console.warn(warnMsg, compressError);
        await job.log(warnMsg);
        uploadBuffer = rawBuffer;
      }

      await defaultImageStorage.upload(
        uploadBuffer,
        folder,
        fileName,
        "image/webp",
      );
      await job.log(`✅ [S3] Uploaded ${file.s3Key}`);

      // 上傳成功後，清理暫存
      if (file.stagingKey) {
        await defaultImageStorage.delete([file.stagingKey]).catch((delErr) => {
          console.warn(`Failed to delete staging S3 file ${file.stagingKey}:`, delErr);
        });
        await job.log(`🗑️ [S3] Deleted staging file ${file.stagingKey}`);
      }
      if (file.tempPath) {
        await fs.promises.unlink(file.tempPath).catch(() => {});
      }
    } catch (uploadError) {
      const errMessage =
        uploadError instanceof Error
          ? uploadError.message
          : String(uploadError);
      const errMsg = `❌ [Worker] S3 upload failed for post #${postId}: ${errMessage}`;
      console.error(errMsg, uploadError);
      await job.log(errMsg);

      // 若已達到最大重試次數，清理本機暫存檔防止洩漏
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
