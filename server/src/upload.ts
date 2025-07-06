//* upload.ts
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { PoolConnection } from "mysql2/promise";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;
const UPLOAD_IMAGE_LIMIT = process.env.UPLOAD_IMAGE_LIMIT || "5";

// AWS S3 client configuration
export const s3Client = new S3Client({
  region: BUCKET_REGION,
  credentials: {
    accessKeyId: ACCESS_KEY!,
    secretAccessKey: SECRET_ACCESS_KEY!,
  },
});

// Multer S3 configuration
export const uploadConfig = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME!,
    key: function (req, file, cb) {
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `posts/${Date.now()}-${uuidv4()}.${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // 只允許圖片文件
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// 圖片上傳中間件
export const uploadImages = uploadConfig.array(
  "images",
  parseInt(UPLOAD_IMAGE_LIMIT)
);

// 插入圖片到數據庫的輔助函數
export async function insertImages(
  connection: PoolConnection,
  postId: number,
  files: Express.MulterS3.File[]
): Promise<void> {
  if (!files || files.length === 0) return;

  const imageInsertQuery = `
    INSERT INTO images (post_id, image_url, thumbnail_url, alt_text, created_at) 
    VALUES ?
  `;

  const imageValues = files.map((file) => [
    postId,
    file.location,
    file.location, // 暫時使用原圖作為縮圖
    `Image for post ${postId}`,
    new Date(),
  ]);

  await connection.query(imageInsertQuery, [imageValues]);
}

// 從 S3 刪除文件的輔助函數
export async function deleteS3Files(fileUrls: string[]): Promise<void> {
  const BUCKET_NAME = process.env.BUCKET_NAME;

  const deletePromises = fileUrls.map(async (url) => {
    // 從 URL 中提取 S3 key
    const key = url.split(".amazonaws.com/")[1];

    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(deleteCommand);
      console.log(`Successfully deleted: ${key}`);
    } catch (error) {
      console.error(`Failed to delete ${key}:`, error);
    }
  });

  await Promise.all(deletePromises);
}
