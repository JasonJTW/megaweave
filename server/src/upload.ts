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

async function cleanupFailedAvatarUpload(fileKey: string) {
  try {
    await deleteS3Files([fileKey]);
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

  await connection.query(imageInsertQuery, [imageValues]);
}

// 從 S3 刪除文件的輔助函數
export async function deleteS3Files(fileKeys: string[]): Promise<void> {
  const BUCKET_NAME = process.env.BUCKET_NAME;
  if (!BUCKET_NAME) {
    console.error("deleteS3Files: BUCKET_NAME not set");
    return;
  }
  if (!fileKeys || fileKeys.length === 0) return;

  const deletePromises = fileKeys.map(async (key) => {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
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
  userId: number,
  userRole: string,
  file: Express.MulterS3.File
): Promise<{ avatarUrl: string; oldAvatarKey?: string; avatarKey: string }> {
  const s3Key = file.key as string | undefined;
  if (!s3Key) {
    throw new Error("Uploaded file does not have a valid S3 key.");
  }

  const avatarUrl = `${CLOUDFRONT_URL}/${s3Key}`;
  const avatarKey = s3Key;
  try {
    //* Get old avatar url from database
    //* FOR UPDATE <- prevents race when multiple concurrent uploads for same user
    const [rows] = await connection.execute(
      "SELECT avatar_key FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    const row = (rows as RowDataPacket[])[0];
    if (!row) {
      throw new Error("User not found.");
    }

    const oldAvatarKey = row?.avatar_key as string | undefined;

    //* Update new avatar_url and avatar_key to db_users
    await connection.execute(
      "UPDATE users SET avatar_url = ?, avatar_key = ?, updated_at = NOW() WHERE id = ?",
      [avatarUrl, avatarKey, userId]
    );

    //TODO: If role == 'admin || contributor', update db_members too
    if (userRole === "admin" || userRole === "contributor") {
      await connection.execute(
        "UPDATE members SET avatar_url = ?, avatar_key = ? WHERE user_id = ?",
        [avatarUrl, avatarKey, userId]
      );
    }

    return { avatarUrl, avatarKey };
  } catch (error) {
    console.error("Error updating avatar:", error);

    //* If error occurs, try delete the uploaded file from S3
    try {
      await cleanupFailedAvatarUpload(s3Key);
    } catch (cleanupError) {
      console.error(
        "Failed to clean up uploaded avatar after DB error:",
        cleanupError
      );
    }
    throw error;
  }
}
