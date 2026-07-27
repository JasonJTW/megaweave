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
  { prefix: "resized/thumb_", width: 150, height: 150, fit: "cover" },
  { prefix: "resized/medium_", width: 600, fit: "inside" }
];
var CONFIG = {
  webpQuality: 80,
  cacheControl: "public,max-age=31536000,immutable"
};
var handler = async (event) => {
  console.log("Received S3 Event:", JSON.stringify(event, null, 2));
  for (const record of event.Records) {
    await processRecord(record);
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
  if (key.startsWith("resized/")) {
    console.log(`Skipping key in 'resized/' directory: ${key}`);
    return;
  }
  const getObjRes = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
  if (!getObjRes.Body) {
    console.log(`Object body is empty for ${key}`);
    return;
  }
  if (!getObjRes.ContentType?.startsWith("image/")) {
    console.log(`Skip non-image object (ContentType: ${getObjRes.ContentType}): ${key}`);
    return;
  }
  const byteArray = await getObjRes.Body.transformToByteArray();
  const inputBuffer = Buffer.from(byteArray);
  for (const size of THUMBNAIL_SIZES) {
    const targetKey = buildThumbnailKey(key, size.prefix);
    if (await thumbnailExists(bucket, targetKey)) {
      console.log(`Thumbnail already exists: ${targetKey}`);
      continue;
    }
    const thumbnailBuffer = await sharp(inputBuffer).rotate().resize({
      width: size.width,
      height: size.height,
      fit: size.fit,
      withoutEnlargement: true
    }).webp({ quality: CONFIG.webpQuality }).toBuffer();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: targetKey,
        Body: thumbnailBuffer,
        ContentType: "image/webp",
        CacheControl: CONFIG.cacheControl,
        Metadata: {
          originalKey: key,
          generatedBy: "megaweave-image-resizer"
        }
      })
    );
    console.log(`Successfully generated thumbnail: ${targetKey}`);
  }
}
function buildThumbnailKey(srcKey, prefix) {
  const filename = srcKey.split("/").pop()?.replace(/\.[^.]+$/, ".webp") ?? "image.webp";
  return `${prefix}${filename}`;
}
async function thumbnailExists(bucket, key) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
}
export {
  handler
};
