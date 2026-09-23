import sharp from "sharp";
import { Job } from "bullmq";
import { defaultImageStorage } from "../../storage/ImageStorage";
import { POST_IMAGES_IN_PARALLEL_PER_JOB } from "../concurrency";

export interface PostUploadImageJobData {
  postId: number;
  files: Array<{
    s3Key: string;
    stagingKey: string;
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

  // 每張圖的 S3 下載 / 上傳 / 刪除彼此獨立；同時處理數張，讓一張等待 S3 時另一張使用 CPU
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < files.length; i += POST_IMAGES_IN_PARALLEL_PER_JOB) {
    const batch = files.slice(i, i + POST_IMAGES_IN_PARALLEL_PER_JOB);
    results.push(
      ...(await Promise.allSettled(
        batch.map((file) => processStagedImage(job, postId, file)),
      )),
    );
  }
  // 等所有圖片結束後才拋出，避免 BullMQ retry 時仍有上一輪的上傳在進行
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;

  const finishMsg = `✅ [Worker] S3 upload finished for post #${postId}`;
  console.log(finishMsg);
  await job.log(finishMsg);
}

async function processStagedImage(
  job: Job<PostUploadImageJobData>,
  postId: number,
  file: PostUploadImageJobData["files"][number],
): Promise<void> {
  const segments = file.s3Key.split("/");
  const folder = segments[0];
  const fileName = segments.slice(1).join("/");

  try {
    // 1. 從 S3 Staging 下載原始檔案
    await job.log(
      `📥 [Worker] Fetching staging image from S3: ${file.stagingKey}`,
    );
    const rawBuffer = await defaultImageStorage.getObjectBuffer(
      file.stagingKey,
    );

    let uploadBuffer: Buffer;
    try {
      // 2. 讀取真實圖片 metadata（支援 iPhone raw/heic/jpeg/png 等格式）
      const meta = await sharp(rawBuffer).metadata();
      const isAlreadyOptimal =
        meta.format === "webp" &&
        (meta.width ?? Infinity) <= 1200 &&
        (meta.height ?? Infinity) <= 1200;

      if (isAlreadyOptimal) {
        uploadBuffer = rawBuffer;
        await job.log(
          `⚡ [sharp] Skipped compression (already WebP ${meta.width}×${meta.height})`,
        );
      } else {
        // 執行 resize + WebP 轉換
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

    // 3. 上傳正式 S3 物件
    await defaultImageStorage.upload(
      uploadBuffer,
      folder,
      fileName,
      "image/webp",
    );
    await job.log(`✅ [S3] Uploaded ${file.s3Key}`);

    // 4. 清理 S3 暫存原始檔
    await defaultImageStorage.delete([file.stagingKey]).catch((delErr) => {
      console.warn(
        `Failed to delete staging S3 file ${file.stagingKey}:`,
        delErr,
      );
    });
    await job.log(`🗑️ [S3] Deleted staging file ${file.stagingKey}`);
  } catch (uploadError) {
    const errMessage =
      uploadError instanceof Error ? uploadError.message : String(uploadError);
    const errMsg = `❌ [Worker] S3 upload failed for post #${postId}: ${errMessage}`;
    console.error(errMsg, uploadError);
    await job.log(errMsg);
    throw uploadError; // 重新拋出錯誤讓 BullMQ 進行 Retry
  }
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
