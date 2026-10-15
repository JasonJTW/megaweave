import { Request, Response, Router } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { RowDataPacket } from "mysql2";
import { createNotification } from "./utils/notificationService";
import { enqueueUserVectorUpdate } from "./queue/queues";

const router = Router({ mergeParams: true });

const likeBodySchema = z.object({ liked: z.boolean() });

type LikeOutcome = {
  postId: number;
  postOwnerId: number;
  postTitle: string;
  liked: boolean;
  changed: boolean;
  likesCount: number;
};

//* lock the post row, then set like state to `desired` (toggle when undefined)
//* FOR UPDATE <- serializes concurrent like/unlike on the same post,
//* so the existence check and the write below cannot interleave
const applyLike = async (
  connection: PoolConnection,
  publicId: string,
  userId: number,
  desired?: boolean
): Promise<LikeOutcome | null> => {
  const [postRows] = await connection.execute<RowDataPacket[]>(
    "SELECT id, user_id, title FROM posts WHERE public_id = ? AND deleted_at IS NULL FOR UPDATE",
    [publicId]
  );

  if (postRows.length === 0) return null;

  const postId = postRows[0].id as number;
  const postOwnerId = postRows[0].user_id as number;
  const postTitle = postRows[0].title as string;

  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?",
    [userId, postId]
  );
  const currentlyLiked = rows.length > 0;
  const liked = desired ?? !currentlyLiked;
  const changed = liked !== currentlyLiked;

  if (liked && changed) {
    await connection.execute(
      "INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)",
      [userId, postId]
    );
    await connection.execute(
      "UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?",
      [postId]
    );
  } else if (!liked && changed) {
    await connection.execute(
      "DELETE FROM post_likes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
    );
    await connection.execute(
      "UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?",
      [postId]
    );
  }

  const [countRows] = await connection.execute<RowDataPacket[]>(
    "SELECT likes_count FROM posts WHERE id = ?",
    [postId]
  );

  return {
    postId,
    postOwnerId,
    postTitle,
    liked,
    changed,
    likesCount: Number(countRows[0].likes_count),
  };
};

//* notification & user-vector update only when a new like is created
const afterLike = (
  res: Response,
  outcome: LikeOutcome,
  publicId: string,
  userId: number,
  username: string | undefined
) => {
  if (!outcome.changed || !outcome.liked) return;
  if (outcome.postOwnerId === userId) return;

  const io = res.locals.io;
  if (io) {
    createNotification(io, {
      recipient_id: outcome.postOwnerId,
      sender_id: userId,
      type: "LIKE",
      title: "New Like",
      content: `${username} liked your post "${outcome.postTitle}"`,
      link: `/item/${publicId}`,
    }).catch((err) =>
      console.error("Failed to create like notification:", err)
    );
  }

  enqueueUserVectorUpdate({
    userId,
    postId: outcome.postId,
    action: "like",
  }).catch((err) =>
    console.error("Failed to enqueue user-vector (like):", err)
  );
};

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

//* declarative: set like state to body.liked (idempotent, safe to retry)
router.put("/", requireAuth, async (req: Request, res: Response) => {
  const publicId = req.params.publicId || req.params.postId || req.params.id;
  const userId = req.user?.userId;
  const username = req.user?.username;

  if (!publicId) {
    return res.status(400).json({ errorMessage: "Invalid post ID" });
  }

  if (!userId) {
    return res.status(401).json({ errorMessage: "Please signin first" });
  }

  const parsed = likeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorMessage: "Invalid like payload" });
  }

  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const outcome = await applyLike(connection, publicId, userId, parsed.data.liked);

    if (!outcome) {
      await connection.rollback();
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    await connection.commit();
    afterLike(res, outcome, publicId, userId, username);

    return res.json({ liked: outcome.liked, likesCount: outcome.likesCount });
  } catch (error) {
    await connection.rollback();
    console.error("Error setting like state: ", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  } finally {
    connection.release();
  }
});

//* legacy toggle (kept for old clients; prefer PUT)
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
    const outcome = await applyLike(connection, publicId, userId);

    if (!outcome) {
      await connection.rollback();
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    await connection.commit();
    afterLike(res, outcome, publicId, userId, username);

    return res.json({ liked: outcome.liked });
  } catch (error) {
    await connection.rollback();
    console.error("Error liking/unliking post: ", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  } finally {
    connection.release();
  }
});

export default router;
