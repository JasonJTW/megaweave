// index.ts
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import sharp from "sharp";
var s3 = new S3Client({});
var THUMBNAIL_SIZES = [
  { size: "thumb", width: 300, fit: "inside" },
  // 清單、頭貼、小預覽
  { size: "medium", width: 800, fit: "inside" }
  // 文章內嵌、大預覽
];
var THUMBNAIL_SIZE_NAMES = new Set(THUMBNAIL_SIZES.map((s) => s.size));
var CONFIG = {
  webpQuality: 80,
  cacheControl: "public,max-age=31536000,immutable",
  // 縮圖寫入的目標 Bucket；若未設定則退回使用來源 Bucket（方便本地測試）
  destinationBucket: process.env.DESTINATION_BUCKET
};
var handler = async (event) => {
  console.log("Received S3 Event:", JSON.stringify(event, null, 2));
  const failures = [];
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
      `Failed to process ${failures.length} record(s): ${failures.join(", ")}`
    );
  }
};
async function processRecord(record) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const objectSize = record.s3.object.size ?? 0;
  if (objectSize === 0) {
    console.log(`Skip empty object: ${key}`);
    return;
  }
  const keySegments = key.split("/");
  if (keySegments.length >= 2 && THUMBNAIL_SIZE_NAMES.has(keySegments[1])) {
    console.log(`Skipping already-processed thumbnail: ${key}`);
    return;
  }
  console.log(`[Step 1] Fetching original object from bucket: ${bucket}, key: ${key}`);
  const getObjRes = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
  console.log(`[Step 1] Successfully fetched original object. ContentType: ${getObjRes.ContentType}`);
  if (!getObjRes.Body) {
    console.log(`Object body is empty for ${key}`);
    return;
  }
  if (!getObjRes.ContentType?.startsWith("image/")) {
    console.log(
      `Skip non-image object (ContentType: ${getObjRes.ContentType}): ${key}`
    );
    return;
  }
  const byteArray = await getObjRes.Body.transformToByteArray();
  const inputBuffer = Buffer.from(byteArray);
  const destBucket = CONFIG.destinationBucket;
  console.log(`[Step 2] Destination bucket is: ${destBucket}`);
  const targetKeys = THUMBNAIL_SIZES.map(
    (size) => buildThumbnailKey(key, size.size)
  );
  console.log(`[Step 2] Checking existence for target keys:`, targetKeys);
  const existsResults = await Promise.all(
    targetKeys.map((targetKey) => thumbnailExists(destBucket, targetKey))
  );
  for (let i = 0; i < THUMBNAIL_SIZES.length; i++) {
    const size = THUMBNAIL_SIZES[i];
    const targetKey = targetKeys[i];
    if (existsResults[i]) {
      console.log(`Thumbnail already exists, skipping: ${targetKey}`);
      continue;
    }
    const thumbnailBuffer = await sharp(inputBuffer).rotate().resize({
      width: size.width,
      height: size.height,
      fit: size.fit,
      withoutEnlargement: true
    }).webp({ quality: CONFIG.webpQuality }).toBuffer();
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
          generatedBy: "megaweave-image-resizer"
        }
      })
    );
    console.log(`Successfully generated thumbnail: ${targetKey}`);
  }
}
function buildThumbnailKey(srcKey, sizeName) {
  const segments = srcKey.split("/");
  const category = segments[0];
  const rest = segments.slice(1);
  const filename = (rest.at(-1) ?? srcKey).replace(/\.[^.]+$/, ".webp");
  const subDirs = rest.slice(0, -1);
  return [category, sizeName, ...subDirs, filename].join("/");
}
async function thumbnailExists(bucket, key) {
  try {
    console.log(`[HeadObject] Checking if exists: bucket=${bucket}, key=${key}`);
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    console.log(`[HeadObject] File exists: ${key}`);
    return true;
  } catch (err) {
    console.log(`[HeadObject] Error for key ${key}: name=${err?.name}, code=${err?.$metadata?.httpStatusCode}`, err);
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
      return false;
    }
    if (err?.$metadata?.httpStatusCode === 403) {
      console.warn(`[HeadObject] Received 403 AccessDenied when checking ${key}. Treating as not exists.`);
      return false;
    }
    throw err;
  }
}
export {
  handler
};
