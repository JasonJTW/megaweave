import { Request, Response, Router } from "express";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { RowDataPacket } from "mysql2";
import { createNotification } from "./utils/notificationService";

const router = Router({ mergeParams: true });

//* check user's like status
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const postIdStr = req.params.postId || req.params.id;
  const postId = parseInt(postIdStr, 10);
  const userId = req.user?.userId;

  if (!postIdStr || isNaN(postId)) {
    return res.status(400).json({ errorMessage: "Invalid post ID" });
  }

  if (!userId)
    return res.status(401).json({ errorMessage: "Please signin first" });

  try {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
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
  const postIdStr = req.params.postId || req.params.id;
  const postId = parseInt(postIdStr, 10);
  const userId = req.user?.userId;
  const username = req.user?.username;

  if (!postIdStr || isNaN(postId)) {
    return res.status(400).json({ errorMessage: "Invalid post ID" });
  }

  if (!userId) {
    return res.status(401).json({ errorMessage: "Please signin first" });
  }

  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();

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

      // Fetch post details for notification
      const [postRows] = await connection.execute<RowDataPacket[]>(
        "SELECT user_id, title FROM posts WHERE id = ?",
        [postId]
      );

      await connection.commit();

      // Trigger notification if liker is not the owner
      if (postRows.length > 0) {
        const post = postRows[0];
        if (post.user_id !== userId) {
          const io = res.locals.io;
          if (io) {
            createNotification(io, {
              recipient_id: post.user_id,
              sender_id: userId,
              type: "LIKE",
              title: "New Like",
              content: `${username} liked your post "${post.title}"`,
              link: `/item/${postId}`,
            }).catch((err) =>
              console.error("Failed to create like notification:", err)
            );
          }
        }
      }

      return res.json({ liked: true });
    }
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ errorMessage: "Server error" });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
