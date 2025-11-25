// routes/comments.ts
import express, { Request, Response } from "express";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import dbPool from "./utils/db";

const router = express.Router();

interface CommentRow extends RowDataPacket {
  id: number;
  post_id: number;
  item_id: number | null;
  parent_id: number | null;
  user_id: number;
  content: string;
  root_id: number | null;
  depth: number;
  path: string;
  created_at: Date;
  username?: string;
  avatar_url?: string;
  public_id?: string;
  like_count?: number;
  reply_count?: number;
}

interface CommentWithChildren extends CommentRow {
  children: CommentWithChildren[];
}

/**
 * POST /comments
 * 創建新留言
 */
router.post("/", async (req: Request, res: Response) => {
  const {
    post_id,
    item_id = null,
    parent_id = null,
    user_id,
    content,
  } = req.body;

  if (!post_id || !user_id || !content?.trim()) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // 如果指定了 item_id，驗證該 item 屬於這個 post
    if (item_id) {
      const [itemRows] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM items WHERE id = ? AND post_id = ?",
        [item_id, post_id]
      );
      if (itemRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: "Item not found in this post" });
      }
    }

    let rootId: number | null = null;
    let depth = 0;
    let path = "";
    let effectiveItemId = item_id;

    if (parent_id) {
      // 取得父留言資料
      const [parentRows] = await connection.query<CommentRow[]>(
        `SELECT id, root_id, depth, path, item_id, post_id 
         FROM comments 
         WHERE id = ? AND is_deleted = 0`,
        [parent_id]
      );

      if (parentRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Parent comment not found" });
      }

      const parent = parentRows[0];

      // 驗證父留言屬於同一篇 post
      if (parent.post_id !== post_id) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Parent comment not in this post" });
      }

      // 子留言繼承父留言的 item_id
      effectiveItemId = parent.item_id;

      // 深度限制
      if (parent.depth >= 10) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Maximum reply depth exceeded" });
      }

      rootId = parent.root_id;
      depth = parent.depth + 1;
      path = parent.path ? `${parent.path}/${parent.id}` : `/${parent.id}`;

      // 更新父留言的 reply_count
      await connection.query(
        "UPDATE comments SET reply_count = reply_count + 1 WHERE id = ?",
        [parent_id]
      );
    }

    // 插入新留言
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO comments 
       (post_id, item_id, parent_id, user_id, content, root_id, depth, path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        post_id,
        effectiveItemId,
        parent_id,
        user_id,
        content.trim(),
        rootId,
        depth,
        path,
      ]
    );

    const insertedId = result.insertId;

    // 頂層留言：更新 root_id 為自己
    if (!parent_id) {
      await connection.query("UPDATE comments SET root_id = ? WHERE id = ?", [
        insertedId,
        insertedId,
      ]);
    }

    await connection.commit();

    // 🔥 返回新留言時也 JOIN users 獲取完整資訊
    const [newCommentRows] = await connection.query<CommentRow[]>(
      `SELECT 
        c.*,
        u.username,
        u.avatar_url,
        u.public_id
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?`,
      [insertedId]
    );

    const newComment = newCommentRows[0];

    res.status(201).json({
      message: "Comment created",
      comment: newComment,
    });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error creating comment:", err);
    res.status(500).json({ message: "Failed to create comment" });
  } finally {
    connection.release();
  }
});

/**
 * GET /comments?post_id=123
 * GET /comments?post_id=123&item_id=1
 * GET /comments?post_id=123&item_id=all
 *
 * 🔥 修改：JOIN users 表獲取 public_id
 */
router.get("/", async (req: Request, res: Response) => {
  const postId = Number(req.query.post_id);
  const itemIdParam = req.query.item_id;

  if (!postId || isNaN(postId)) {
    return res.status(400).json({ message: "Valid post_id is required" });
  }

  try {
    let query = `
      SELECT 
        c.*,
        u.username,
        u.avatar_url,
        u.public_id
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.is_deleted = 0
    `;
    const params: any[] = [postId];

    // 篩選特定 item 或 all
    if (itemIdParam === "all") {
      query += " AND c.item_id IS NULL";
    } else if (itemIdParam && !isNaN(Number(itemIdParam))) {
      query += " AND c.item_id = ?";
      params.push(Number(itemIdParam));
    }

    query += `
      ORDER BY 
        c.item_id IS NULL DESC,
        c.item_id ASC,
        COALESCE(c.root_id, c.id) ASC,
        c.depth ASC,
        c.created_at ASC
    `;

    const [rows] = await dbPool.query<CommentRow[]>(query, params);

    // 建立樹狀結構
    const commentMap = new Map<number, CommentWithChildren>();
    rows.forEach((c) => commentMap.set(c.id, { ...c, children: [] }));

    const roots: CommentWithChildren[] = [];
    rows.forEach((comment) => {
      const node = commentMap.get(comment.id)!;
      if (!comment.parent_id) {
        roots.push(node);
      } else {
        const parent = commentMap.get(comment.parent_id);
        if (parent) parent.children.push(node);
      }
    });

    // 依 item 分組
    const grouped: Record<string, CommentWithChildren[]> = { all: [] };

    roots.forEach((comment) => {
      const key = comment.item_id === null ? "all" : `item_${comment.item_id}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(comment);
    });

    console.log("comments rows: ", rows);

    res.json({
      post_id: postId,
      total: rows.length,
      comments: grouped,
    });
  } catch (err: any) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

/**
 * GET /comments/counts?post_id=123
 * 取得各 item 的留言數量
 */
router.get("/counts", async (req: Request, res: Response) => {
  const postId = Number(req.query.post_id);

  if (!postId || isNaN(postId)) {
    return res.status(400).json({ message: "Valid post_id is required" });
  }

  try {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT 
        item_id,
        COUNT(*) as count
      FROM comments
      WHERE post_id = ? AND is_deleted = 0
      GROUP BY item_id`,
      [postId]
    );

    const counts: Record<string, number> = { all: 0 };

    rows.forEach((row) => {
      const key = row.item_id === null ? "all" : `item_${row.item_id}`;
      counts[key] = row.count;
    });

    res.json({ post_id: postId, counts });
  } catch (err: any) {
    console.error("Error fetching comment counts:", err);
    res.status(500).json({ message: "Failed to fetch counts" });
  }
});

export default router;
