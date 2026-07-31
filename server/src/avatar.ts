import { RowDataPacket } from "mysql2";
import { memoryUpload, updateAvatar } from "./upload";
import { defaultImageStorage } from "./storage/ImageStorage";
import { Response, Router } from "express";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import dbPool from "./utils/db";
import { updateUserSession } from "./session";
dotenv.config();

const S3_BUCKET_AVATAR_FOLDER =
  process.env.S3_BUCKET_AVATAR_FOLDER || "avatars";

const router = Router();
router.post(
  "/",
  requireAuth,
  memoryUpload.single("avatar"),
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      // * start transaction
      if (!req.file) {
        return res
          .status(400)
          .json({ errorMessage: "Please upload an image file." });
      }

      const userId = req.user!.userId;
      const userRole = req.user!.role;

      // Upload directly to S3 (Lambda resizer handles thumbnailing asynchronously)
      const { key: avatarKey, url: avatarUrl } =
        await defaultImageStorage.upload(
          req.file.buffer,
          S3_BUCKET_AVATAR_FOLDER,
          `${Date.now()}-${randomUUID()}.webp`,
        );

      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      const result = await updateAvatar(
        connection,
        userId,
        userRole,
        avatarUrl,
        avatarKey,
      );
      await connection.commit();

      //! async delete old avatar (file-and-forget)
      const oldAvatarKey = result.oldAvatarKey;
      const newAvatarKey = avatarKey;
      if (oldAvatarKey && oldAvatarKey !== newAvatarKey) {
        void defaultImageStorage
          .delete([oldAvatarKey])
          .then(() => console.log(`Delete old Avatar ${oldAvatarKey}`))
          .catch((e) =>
            console.error("Failed to delete old avatar (async):", e),
          );
      }
      return res.status(200).json({
        message: "Avatar uploaded successfully.",
        avatarUrl: result.avatarUrl,
        avatarKey: result.avatarKey,
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
      }
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Error rolling back transaction:", rollbackError);
        }
      }
      return res
        .status(500)
        .json({ errorMessage: "Failed to upload avatar. " });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

router.delete(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user!.userId;

      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      // Get current avatar key before deleting
      let oldAvatarKey: string | null = null;

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT avatar_key FROM users WHERE id = ?`,
        [userId],
      );

      if (Array.isArray(rows) && rows.length > 0) {
        oldAvatarKey = (rows[0] as RowDataPacket).avatar_key;
      }

      // Update database to remove avatar
      await connection.execute(
        `UPDATE users SET avatar_url = NULL, avatar_key = NULL WHERE id = ?`,
        [userId],
      );

      await connection.commit();
      await updateUserSession(req, { avatar_url: null, avatar_key: null });
      //! async delete avatar from S3 (fire-and-forget)
      // todo:
      if (oldAvatarKey) {
        void defaultImageStorage
          .delete([oldAvatarKey])
          .then(() => console.log(`Deleted avatar ${oldAvatarKey}`))
          .catch((e) =>
            console.error("Failed to delete avatar from S3 (async):", e),
          );
      }

      return res.status(200).json({
        message: "Avatar removed successfully.",
      });
    } catch (error) {
      console.error("Error removing avatar:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
      }
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Error rolling back transaction:", rollbackError);
        }
      }
      return res.status(500).json({ errorMessage: "Failed to remove avatar." });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

export default router;
