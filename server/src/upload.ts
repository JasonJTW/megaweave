//* upload.ts
import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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


//* Memory storage for images that need processing
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

/**
 * Upload a buffer to S3 directly
 */
export async function uploadToS3(
  buffer: Buffer,
  folder: string,
  fileName: string,
  contentType: string = "image/webp"
): Promise<{ key: string; url: string }> {
  const key = `${folder}/${fileName}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return {
    key,
    url: `${CLOUDFRONT_URL}/${key}`,
  };
}


//* Insert images url into db
export async function insertImages(
  connection: PoolConnection,
  postId: number,
  images: Array<{ url: string; thumbnailUrl: string }>
): Promise<void> {
  if (!images || images.length === 0) return;

  const imageInsertQuery = `
    INSERT INTO images (post_id, image_url, thumbnail_url, alt_text, created_at) 
    VALUES ?
  `;

  const imageValues = images.map((img) => [
    postId,
    img.url,
    img.thumbnailUrl,
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


//* upload user avatar to db and delete old avatar in S3
export async function updateAvatar(
  connection: PoolConnection,
  userId: number,
  userRole: string,
  avatarUrl: string,
  avatarKey: string
): Promise<{ avatarUrl: string; oldAvatarKey?: string; avatarKey: string }> {
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
      await cleanupFailedAvatarUpload(avatarKey);
    } catch (cleanupError) {
      console.error(
        "Failed to clean up uploaded avatar after DB error:",
        cleanupError
      );
    }
    throw error;
  }
}
