import {
  s3Client,
  uploadAvatarImage,
  updateAvatar,
  deleteS3Files,
} from "./upload";
import { Request, Response, Router } from "express";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import dbPool from "./utils/db";
import { updateUserSession } from "./session";
dotenv.config();

const router = Router();
router.post(
  "/",
  requireAuth,
  uploadAvatarImage,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      // * start transaction
      const file = req.file as Express.MulterS3.File;
      if (!file) {
        return res
          .status(400)
          .json({ errorMessage: "Please upload an image file." });
      }

      const userId = req.user!.userId;
      const userRole = req.user!.role;
      connection = await dbPool.getConnection();
      await connection.beginTransaction();
      // TODO: update user avatar url in database
      const result = await updateAvatar(connection, userId, userRole, file);
      await connection.commit();

      //! async delete old avatar (file-and-forget)
      const oldAvatarKey = result.oldAvatarKey;
      const newAvatarKey = file.key as string;
      if (oldAvatarKey && oldAvatarKey !== newAvatarKey) {
        void deleteS3Files([oldAvatarKey])
          .then(() => console.log(`Delete old Avatar ${oldAvatarKey}`))
          .catch((e) =>
            console.error("Failed to delete old avatar (async):", e)
          );
      }
      return res.status(200).json({
        message: "Avatar uploaded successfully.",
        avatarUrl: result.avatarUrl,
        avatarKey: result.avatarKey,
      });
    } catch (error) {
      //TODO: handle errors
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
  }
);

router.delete(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      // Get current avatar key before deleting
      let oldAvatarKey: string | null = null;

      const [rows] = await connection.query(
        `SELECT avatar_key FROM users WHERE id = ?`,
        [userId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        oldAvatarKey = (rows[0] as any).avatar_key;
      }

      // Update database to remove avatar
      await connection.query(
        `UPDATE users SET avatar_url = NULL, avatar_key = NULL WHERE id = ?`,
        [userId]
      );

      await connection.commit();
      await updateUserSession(req, { avatar_url: null, avatar_key: null });
      //! async delete avatar from S3 (fire-and-forget)
      // todo:
      if (oldAvatarKey) {
        void deleteS3Files([oldAvatarKey])
          .then(() => console.log(`Deleted avatar ${oldAvatarKey}`))
          .catch((e) =>
            console.error("Failed to delete avatar from S3 (async):", e)
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
  }
);

export default router;
