import { Request, Response, Router } from "express";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { RowDataPacket } from "mysql2";
import { createNotification } from "./utils/notificationService";
import { enqueueUserVectorUpdate } from "./queue/queues";

const router = Router({ mergeParams: true });

//* check user's like status
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const publicId = req.params.publicId || req.params.postId || req.params.id;
  const userId = req.user?.userId;

  if (!publicId) {
    return res.status(400).json({ errorMessage: "Invalid post ID" });
  }

  if (!userId)
    return res.status(401).json({ errorMessage: "Please signin first" });

  try {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT 1 FROM post_likes pl 
       JOIN posts p ON pl.post_id = p.id 
       WHERE pl.user_id = ? AND p.public_id = ? AND p.deleted_at IS NULL`,
      [userId, publicId]
    );
    const liked = rows.length > 0;
    return res.status(200).json({ liked: liked });
  } catch (error) {
    console.log("Error getting user liked status: ", error);
    return res.status(400).json({ errorMessage: "Server Error" });
  }
});

//* like / unlike
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const publicId = req.params.publicId || req.params.postId || req.params.id;
  const userId = req.user?.userId;
  const username = req.user?.username;

  if (!publicId) {
    return res.status(400).json({ errorMessage: "Invalid post ID" });
  }

  if (!userId) {
    return res.status(401).json({ errorMessage: "Please signin first" });
  }

  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();

    const [postRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, user_id, title FROM posts WHERE public_id = ? AND deleted_at IS NULL",
      [publicId]
    );

    if (postRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    const postId = postRows[0].id as number;
    const postOwnerId = postRows[0].user_id as number;
    const postTitle = postRows[0].title as string;

    // check if user liked already
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
    );

    if (rows.length > 0) {
      // liked already -> unlike
      await connection.execute(
        "DELETE FROM post_likes WHERE user_id = ? AND post_id = ?",
        [userId, postId]
      );

      await connection.execute(
        "UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?",
        [postId]
      );

      await connection.commit();
      return res.json({ liked: false });
    } else {
      // not liked yet -> likes
      await connection.execute(
        "INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)",
        [userId, postId]
      );

      await connection.execute(
        "UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?",
        [postId]
      );

      await connection.commit();

      // Trigger notification & user-vector update if liker is not the owner
      if (postOwnerId !== userId) {
        const io = res.locals.io;
        if (io) {
          createNotification(io, {
            recipient_id: postOwnerId,
            sender_id: userId,
            type: "LIKE",
            title: "New Like",
            content: `${username} liked your post "${postTitle}"`,
            link: `/item/${publicId}`,
          }).catch((err) =>
            console.error("Failed to create like notification:", err)
          );
        }

        enqueueUserVectorUpdate({
          userId,
          postId,
          action: "like",
        }).catch((err) =>
          console.error("Failed to enqueue user-vector (like):", err)
        );
      }

      return res.json({ liked: true });
    }
  } catch (error) {
    await connection.rollback();
    console.error("Error liking/unliking post: ", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  } finally {
    connection.release();
  }
});

export default router;
