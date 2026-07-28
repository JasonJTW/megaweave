import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { S3Event, S3EventRecord, S3Handler } from "aws-lambda";
import sharp, { FitEnum } from "sharp";

const s3 = new S3Client({});

interface ThumbnailSize {
  /** 語意化尺寸名稱，直接作為路徑的第二層目錄 (e.g. "thumb", "medium") */
  size: string;
  width: number;
  height?: number;
  fit: keyof FitEnum;
}

// 定義預設要生成的縮圖尺寸規格
// fit: 'inside' — 等比縮放至寬度上限，不裁切（適合保留原圖完整內容）
// fit: 'cover'  — 等比縮放後裁切至固定尺寸（適合需要齊整方格的 UI）
//
// 產出路徑範例（megaweave-thumbnails bucket）：
//   avatars/user-123.jpg  →  avatars/thumb/user-123.webp
//                         →  avatars/medium/user-123.webp
//   posts/abc/hero.png    →  posts/thumb/abc/hero.webp
//                         →  posts/medium/abc/hero.webp
const THUMBNAIL_SIZES: ThumbnailSize[] = [
  { size: "thumb", width: 300, fit: "inside" }, // 清單、頭貼、小預覽
  { size: "medium", width: 800, fit: "inside" }, // 文章內嵌、大預覽
];

/** 用 Set 快速判斷某 key 是否已是縮圖（防止 Lambda 在同 bucket 時無限觸發） */
const THUMBNAIL_SIZE_NAMES = new Set(THUMBNAIL_SIZES.map((s) => s.size));

const CONFIG = {
  webpQuality: 80,
  cacheControl: "public,max-age=31536000,immutable",
  // 縮圖寫入的目標 Bucket；若未設定則退回使用來源 Bucket（方便本地測試）
  destinationBucket: process.env.DESTINATION_BUCKET,
};

export const handler: S3Handler = async (event: S3Event): Promise<void> => {
  console.log("Received S3 Event:", JSON.stringify(event, null, 2));

  // 隔離每筆 record 的錯誤：單筆失敗不影響其他 records 繼續處理
  const failures: string[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      console.error(`Failed to process record (key: ${key}):`, err);
      failures.push(key);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Failed to process ${failures.length} record(s): ${failures.join(", ")}`,
    );
  }
};

async function processRecord(record: S3EventRecord): Promise<void> {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const objectSize = record.s3.object.size ?? 0;

  // 1. 防呆條件過濾
  if (objectSize === 0) {
    console.log(`Skip empty object: ${key}`);
    return;
  }

  // 若第二層路徑是已知的 size 名稱，代表這是縮圖本身，跳過以防無限觸發
  // e.g. "avatars/thumb/user-123.webp" → segments[1] === "thumb"
  const keySegments = key.split("/");
  if (keySegments.length >= 2 && THUMBNAIL_SIZE_NAMES.has(keySegments[1])) {
    console.log(`Skipping already-processed thumbnail: ${key}`);
    return;
  }

  // 2. 從 S3 取得原圖
  console.log(
    `[Step 1] Fetching original object from bucket: ${bucket}, key: ${key}`,
  );
  const getObjRes = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  console.log(
    `[Step 1] Successfully fetched original object. ContentType: ${getObjRes.ContentType}`,
  );

  if (!getObjRes.Body) {
    console.log(`Object body is empty for ${key}`);
    return;
  }

  const isImageByExt = /\.(jpe?g|png|webp|gif|avif|tiff?|svg)$/i.test(key);
  if (!getObjRes.ContentType?.startsWith("image/") && !isImageByExt) {
    console.log(
      `Skip non-image object (ContentType: ${getObjRes.ContentType}): ${key}`,
    );
    return;
  }

  // 3. 使用 AWS SDK v3 原生 transformToByteArray 轉為 Buffer
  const byteArray = await getObjRes.Body.transformToByteArray();
  const inputBuffer = Buffer.from(byteArray);

  // 4. 針對每一種設定的縮圖規格處理
  const destBucket = CONFIG.destinationBucket!;
  console.log(`[Step 2] Destination bucket is: ${destBucket}`);
  const targetKeys = THUMBNAIL_SIZES.map((size) =>
    buildThumbnailKey(key, size.size),
  );
  console.log(`[Step 2] Checking existence for target keys:`, targetKeys);
  const existsResults = await Promise.all(
    targetKeys.map((targetKey) => thumbnailExists(destBucket, targetKey)),
  );

  for (let i = 0; i < THUMBNAIL_SIZES.length; i++) {
    const size = THUMBNAIL_SIZES[i];
    const targetKey = targetKeys[i];

    if (existsResults[i]) {
      console.log(`Thumbnail already exists, skipping: ${targetKey}`);
      continue;
    }

    const thumbnailBuffer = await sharp(inputBuffer)
      .rotate() // 自動導正圖片方向 (修正 EXIF 轉角)
      .resize({
        width: size.width,
        height: size.height,
        fit: size.fit,
        withoutEnlargement: true,
      })
      .webp({ quality: CONFIG.webpQuality })
      .toBuffer();

    // 5. 寫入目標 Bucket（DESTINATION_BUCKET env var；未設定則退回來源 Bucket）
    // 將 Sharp 的 SharedArrayBuffer 轉換為標準的 Uint8Array，相容 Node 24 加密 Hash 規範
    const bodyUint8Array = new Uint8Array(thumbnailBuffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: destBucket,
        Key: targetKey,
        Body: bodyUint8Array,
        ContentType: "image/webp",
        CacheControl: CONFIG.cacheControl,
        Metadata: {
          sourceBucket: bucket,
          originalKey: key,
          generatedBy: "megaweave-image-resizer",
        },
      }),
    );

    console.log(`Successfully generated thumbnail: ${targetKey}`);
  }
}

/**
 * 依據原始 Key 與語意化尺寸名稱建立縮圖 Key
 *
 * 規則：將 size 名稱插入第一層目錄（category）之後
 *   avatars/user-123.jpg    + "thumb"  → avatars/thumb/user-123.webp
 *   posts/abc/hero.png      + "medium" → posts/medium/abc/hero.webp
 *
 * @param srcKey   原始 S3 Key，第一層必須是 category (avatars/posts/…)
 * @param sizeName 語意化尺寸名稱 ("thumb" | "medium")
 */
function buildThumbnailKey(srcKey: string, sizeName: string): string {
  const thumbnailFolderName = "thumbnails";
  const segments = srcKey.split("/");
  const category = segments[0]; // e.g. "avatars"
  const rest = segments.slice(1); // e.g. ["user-123.jpg"] or ["abc", "hero.png"]
  const filename = (rest.at(-1) ?? srcKey).replace(/\.[^.]+$/, ".webp");
  const subDirs = rest.slice(0, -1); // 中間子目錄（若有）

  return [thumbnailFolderName, category, sizeName, ...subDirs, filename].join(
    "/",
  );
}

/**
 * 檢查指定的 S3 Key 是否已經存在
 */
async function thumbnailExists(bucket: string, key: string): Promise<boolean> {
  try {
    console.log(
      `[HeadObject] Checking if exists: bucket=${bucket}, key=${key}`,
    );
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    console.log(`[HeadObject] File exists: ${key}`);
    return true;
  } catch (err: any) {
    console.log(
      `[HeadObject] Error for key ${key}: name=${err?.name}, code=${err?.$metadata?.httpStatusCode}`,
      err,
    );
    if (
      err?.$metadata?.httpStatusCode === 404 ||
      err?.name === "NotFound" ||
      err?.name === "NoSuchKey"
    ) {
      return false;
    }
    // 如果是 403 AccessDenied，印出明確 warning 並當作不存在繼續嘗試，避免死鎖
    if (err?.$metadata?.httpStatusCode === 403) {
      console.warn(
        `[HeadObject] Received 403 AccessDenied when checking ${key}. Treating as not exists.`,
      );
      return false;
    }
    throw err;
  }
}
