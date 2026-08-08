//* upload.ts
import multer from "multer";
import dotenv from "dotenv";
import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { defaultImageStorage } from "./storage/ImageStorage";

dotenv.config();

/**
 * Delete files from S3 via ImageStorage
 */
export async function deleteS3Files(fileKeys: string[]): Promise<void> {
  return defaultImageStorage.delete(fileKeys);
}

async function cleanupFailedAvatarUpload(fileKey: string) {
  try {
    await deleteS3Files([fileKey]);
    console.log("Cleaned up failed upload avatar from S3");
  } catch (cleanupError) {
    console.error("Failed to clean up uploaded avatar:", cleanupError);
  }
}

import fs from "fs";
import os from "os";
import path from "path";

const tempUploadDir = path.join(os.tmpdir(), "megaweave-uploads");
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

//* Disk storage for temporary file uploads
export const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, tempUploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname) || ".img";
      cb(null, `${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

//* Memory storage for images that need processing
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

/**
 * Upload a buffer to S3 directly via ImageStorage
 */
export async function uploadToS3(
  buffer: Buffer,
  folder: string,
  fileName: string,
  contentType: string = "image/webp",
): Promise<{ key: string; url: string }> {
  return defaultImageStorage.upload(buffer, folder, fileName, contentType);
}

//* Insert images into db
export async function insertImages(
  connection: PoolConnection,
  postId: number,
  images: Array<{ key: string }>,
): Promise<void> {
  if (!images || images.length === 0) return;

  const imageInsertQuery = `
    INSERT INTO images (post_id, s3_key, alt_text, created_at) 
    VALUES ?
  `;

  const imageValues = images.map((img) => [
    postId,
    img.key,
    `Image for post ${postId}`,
    new Date(),
  ]);

  await connection.query(imageInsertQuery, [imageValues]);
}

//* upload user avatar to db and delete old avatar in S3
export async function updateAvatar(
  connection: PoolConnection,
  userId: number,
  userRole: string,
  avatarUrl: string,
  avatarKey: string,
): Promise<{ avatarUrl: string; oldAvatarKey?: string; avatarKey: string }> {
  try {
    //* Get old avatar url from database
    //* FOR UPDATE <- prevents race when multiple concurrent uploads for same user
    const [rows] = await connection.execute(
      "SELECT avatar_key FROM users WHERE id = ? FOR UPDATE",
      [userId],
    );
    const row = (rows as RowDataPacket[])[0];
    if (!row) {
      throw new Error("User not found.");
    }

    //* Update new avatar_url and avatar_key to db_users
    await connection.execute(
      "UPDATE users SET avatar_url = ?, avatar_key = ?, updated_at = NOW() WHERE id = ?",
      [avatarUrl, avatarKey, userId],
    );

    //TODO: If role == 'admin || contributor', update db_members too
    if (userRole === "admin" || userRole === "contributor") {
      await connection.execute(
        "UPDATE members SET avatar_url = ?, avatar_key = ? WHERE user_id = ?",
        [avatarUrl, avatarKey, userId],
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
        cleanupError,
      );
    }
    throw error;
  }
}
