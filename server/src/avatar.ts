import { s3Client, uploadAvatarImage, updateAvatar } from "./upload";
import { Request, Response, Router } from "express";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import dbPool from "./utils/db";
dotenv.config();

//* TEST: Testing github action runner
const router = Router();
router.post(
  "/",
  requireAuth,
  uploadAvatarImage,
  async (req: AuthenticatedRequest, res: Response) => {
    let connection;
    try {
      //* start transaction
      const file = req.file as Express.MulterS3.File;
      if (!file) {
        return res
          .status(400)
          .json({ errorMessage: "Please upload an image file." });
      }

      const userId = req.user!.userId;

      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      //TODO: update user avatar url in database
      const avatarUrl = await updateAvatar(connection, userId, file);
      await connection.commit();
      return res.status(200).json({
        message: "Avatar uploaded successfully.",
        avatarUrl: avatarUrl,
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

export default router;
