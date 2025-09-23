//* upload.ts
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;
const UPLOAD_IMAGE_LIMIT = process.env.UPLOAD_IMAGE_LIMIT || "5";
const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL;
const S3_BUCKET_IMAGE_FOLDER = process.env.S3_BUCKET_IMAGE_FOLDER || "posts";
const S3_BUCKET_AVATAR_FOLDER =
  process.env.S3_BUCKET_AVATAR_FOLDER || "avatars";

//* AWS S3 client configuration
export const s3Client = new S3Client({
  region: BUCKET_REGION,
  credentials: {
    accessKeyId: ACCESS_KEY!,
    secretAccessKey: SECRET_ACCESS_KEY!,
  },
});

async function cleanupFailedAvatarUpload(fileUrl: string) {
  try {
    await deleteS3Files([fileUrl]);
    console.log("Cleaned up failed upload avatar from S3");
  } catch (cleanupError) {
    console.error("Failed to clean up uploaded avatar:", cleanupError);
  }
}

//* Multer to S3 configuration
export const uploadConfig = (S3folder: string) => {
  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: BUCKET_NAME!,
      key: function (req, file, cb) {
        const fileExtension = file.originalname.split(".").pop();
        const fileName = `${S3folder}/${Date.now()}-${uuidv4()}.${fileExtension}`;
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
};

export const postsUploadConfig = uploadConfig(S3_BUCKET_IMAGE_FOLDER);
export const avatarUploadConfig = uploadConfig(S3_BUCKET_AVATAR_FOLDER);

//* Upload post images middleware
export const uploadImages = postsUploadConfig.array(
  "images",
  parseInt(UPLOAD_IMAGE_LIMIT)
);

//* Insert images url into db
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
    `${CLOUDFRONT_URL}/${file.key}`, // 暫時使用原圖作為縮圖
    `${CLOUDFRONT_URL}/${file.key}`,
    `Image for post ${postId}`,
    new Date(),
  ]);

  await connection.execute(imageInsertQuery, [imageValues]);
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

//* upload user avatar config
export const uploadAvatarImage = avatarUploadConfig.single("avatar");

//* upload user avatar to db and delete old avatar in S3
export async function updateAvatar(
  connection: PoolConnection,
  userId: string,
  file: Express.MulterS3.File
): Promise<string> {
  const avatarUrl = `${CLOUDFRONT_URL}/${file.key}`;
  try {
    //* Get old avatar url from database

    const [rows] = await connection.execute(
      "SELECT avatar_url FROM users WHERE id = ?",
      [userId]
    );
    const oldAvatarUrl = (rows as RowDataPacket[])[0]?.avatar_url;

    //* Update new avatar url to database
    await connection.execute(
      "UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?",
      [avatarUrl, userId]
    );

    //* Delete old avatar from S3 if it exists
    if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
      try {
        await deleteS3Files([oldAvatarUrl]).catch(console.error);
        console.log(`Successfully delete old avatar: ${oldAvatarUrl}`);
      } catch (s3Error) {
        console.error("Failed to delete old avatar from S3:", s3Error);
        /// Not throwing error here because the main function is success and avoid affecting user experience
      }
    }

    return avatarUrl;
  } catch (error) {
    console.error("Error updating avatar:", error);

    //* If error occurs, try delete the uploaded file from S3
    await cleanupFailedAvatarUpload(avatarUrl);
    throw new Error(
      `Failed to update avatar: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
