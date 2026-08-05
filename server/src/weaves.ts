// server/src/weaves.ts

import Router, { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import { requestWeave, approveWeave, WeaveError } from "./utils/weaveService";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeaveItemRow {
  id: number;
  weave_id: number;
  item_id: number | null;
  quantity: number;
  title: string | null;
}



interface WeaveOutput extends RowDataPacket {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  status: "pending" | "completed" | "cancelled" | "rejected" | "requested";
  giver_confirmed: number;
  receiver_confirmed: number;
  notes: string | null;
  conversation_id: number | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  post_id_original: number;
  post_user_id: number;
  post_title: string;
  post_content: string;
  post_type: "wish" | "share" | "commons";
  post_status_original: "active" | "inactive" | "expired";
  post_location: string | null;
  post_tags: string | null;
  post_category_id: number;
  post_condition_level: number;
  post_expires_at: Date | null;
  post_view_count: number;
  post_likes_count: number;
  post_created_at: Date;
  post_updated_at: Date;
  post_comment_count: number;
  giver_name: string;
  giver_avatar: string;
  receiver_name: string;
  receiver_avatar: string;
  s3_keys: string;
}

// ─── Shared SQL ───────────────────────────────────────────────────────────────

const WEAVE_QUERY_BASE = `
  SELECT 
      w.*,
      p.id AS post_id_original,
      p.user_id AS post_user_id,
      p.title AS post_title,
      p.content AS post_content,
      p.type AS post_type,
      p.status AS post_status_original,
      l.full_address AS post_location, 
      p.tags AS post_tags,
      p.category_id AS post_category_id,
      p.condition_level AS post_condition_level,
      p.expires_at AS post_expires_at,
      p.view_count AS post_view_count,
      p.likes_count AS post_likes_count,
      p.created_at AS post_created_at,
      p.updated_at AS post_updated_at,
      p.comment_count AS post_comment_count,
      giver.username AS giver_name,
      giver.avatar_url AS giver_avatar,
      receiver.username AS receiver_name,
      receiver.avatar_url AS receiver_avatar,
      GROUP_CONCAT(img.s3_key ORDER BY img.id ASC) AS s3_keys
  FROM weaves w
  JOIN posts p ON w.post_id = p.id
  LEFT JOIN locations l ON p.location_id = l.id
  JOIN users giver ON w.giver_id = giver.id
  JOIN users receiver ON w.receiver_id = receiver.id
  LEFT JOIN images img ON p.id = img.post_id
`;

async function processWeaveRows(weaveRows: WeaveOutput[]) {
  if (weaveRows.length === 0) return [];
  const weaveIds = weaveRows.map((r) => r.id);

  const [itemsRows] = await dbPool.query<RowDataPacket[]>(
    `SELECT wi.id, wi.weave_id, wi.item_id, wi.quantity, i.title
     FROM weave_items wi
     LEFT JOIN items i ON wi.item_id = i.id
     WHERE wi.weave_id IN (?)`,
    [weaveIds],
  );

  const itemsMap: Record<number, WeaveItemRow[]> = {};
  (itemsRows as WeaveItemRow[]).forEach((item) => {
    if (!itemsMap[item.weave_id]) itemsMap[item.weave_id] = [];
    itemsMap[item.weave_id].push(item);
  });

  return weaveRows.map((row) => {
    const post = {
      id: row.post_id_original,
      user_id: row.post_user_id,
      title: row.post_title,
      content: row.post_content,
      type: row.post_type,
      status: row.post_status_original,
      location: row.post_location,
      tags: row.post_tags,
      category_id: row.post_category_id,
      condition_level: row.post_condition_level,
      expires_at: row.post_expires_at,
      view_count: row.post_view_count,
      likes_count: row.post_likes_count,
      created_at: row.post_created_at,
      updated_at: row.post_updated_at,
      comment_count: row.post_comment_count,
      s3_keys: row.s3_keys ?? "",
    };

    const items = itemsMap[row.id] || [];
    const firstItem = items[0];

    return {
      id: row.id,
      post_id: row.post_id,
      items,
      // backward-compatible legacy fields
      item_id: firstItem ? firstItem.item_id : null,
      item_title: firstItem ? firstItem.title : null,
      quantity: firstItem ? firstItem.quantity : 1,
      giver_id: row.giver_id,
      receiver_id: row.receiver_id,
      status: row.status,
      notes: row.notes,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      giver_name: row.giver_name,
      giver_avatar: row.giver_avatar,
      receiver_name: row.receiver_name,
      receiver_avatar: row.receiver_avatar,
      giver_confirmed: Boolean(row.giver_confirmed),
      receiver_confirmed: Boolean(row.receiver_confirmed),
      conversation_id: row.conversation_id ?? undefined,
      post,
    };
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST / - 建立 Weave 請求
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { postId, itemId, quantity = 1, notes } = req.body;

  if (!postId) return res.status(400).json({ errorMessage: "Post ID is required" });

  // Normalise items: support array format and legacy single-item format
  interface IncomingItem { itemId?: number; item_id?: number; quantity?: number; }
  let items: Array<{ itemId: number | null; quantity: number }> = [];
  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    items = req.body.items.map((it: IncomingItem) => ({
      itemId: it.itemId || it.item_id ? Number(it.itemId ?? it.item_id) : null,
      quantity: Number(it.quantity || 1),
    }));
  } else if (itemId) {
    items = [{ itemId: Number(itemId), quantity: Number(quantity || 1) }];
  }

  try {
    const result = await requestWeave(
      {
        postId: Number(postId),
        items,
        notes: notes ?? null,
        initiator: {
          id: Number(req.user!.userId),
          name: req.user?.username ?? "Someone",
          publicId: req.user!.public_id,
        },
      },
      res.locals.io ?? null,
    );
    return res.status(201).json({
      message: "Weave request sent successfully",
      weaveId: result.weaveId,
      notificationSent: result.notificationSent,
    });
  } catch (err) {
    if (err instanceof WeaveError)
      return res.status(err.httpStatus).json({ errorMessage: err.message });
    console.error("Error creating weave:", err);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// GET / - 獲取我的交易列表
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { role } = req.query;
    let whereClause = `WHERE (w.giver_id = ? OR w.receiver_id = ?)`;
    const params: (string | number)[] = [userId, userId];

    if (role === "giver") {
      whereClause = `WHERE w.giver_id = ?`;
      params.splice(0, 2, userId);
    } else if (role === "receiver") {
      whereClause = `WHERE w.receiver_id = ?`;
      params.splice(0, 2, userId);
    }

    const query = `${WEAVE_QUERY_BASE} ${whereClause} GROUP BY w.id ORDER BY w.created_at DESC`;
    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, params);
    const weaves = await processWeaveRows(weaveRows);
    return res.status(200).json({ weaves });
  } catch (error) {
    console.error("Error retrieving weaves:", error);
    if (error instanceof Error) console.error(error.stack);
    return res.status(500).json({ errorMessage: "Failed to retrieve weaves" });
  }
});

// GET /:id - 獲取單筆交易紀錄
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const weaveId = req.params.id;
    const query = `${WEAVE_QUERY_BASE} WHERE w.id = ? AND (w.giver_id = ? OR w.receiver_id = ?) GROUP BY w.id`;
    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [weaveId, userId, userId]);
    if (weaveRows.length === 0)
      return res.status(404).json({ errorMessage: "Weave not found" });
    const processed = await processWeaveRows(weaveRows);
    return res.status(200).json({ weave: processed[0] });
  } catch (error) {
    console.error("Error retrieving single weave:", error);
    return res.status(500).json({ errorMessage: "Failed to retrieve weave" });
  }
});

// PATCH /:id/status - 更新 Weave 狀態（雙向確認流程）
router.patch("/:id/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await approveWeave(
      {
        weaveId: req.params.id,
        newStatus: req.body.status,
        userId: Number(req.user!.userId),
        actorName: req.user?.username ?? "Someone",
      },
      res.locals.io ?? null,
    );
    return res.status(200).json({
      message: result.fullyCompleted ? "Success" : "Waiting",
      newStatus: result.newStatus,
      fullyCompleted: result.fullyCompleted,
    });
  } catch (err) {
    if (err instanceof WeaveError)
      return res.status(err.httpStatus).json({ errorMessage: err.message });
    console.error("Error in approveWeave:", err);
    return res.status(500).json({ errorMessage: "Server error" });
  }
});

// GET /public/:uuid - 公開交易紀錄
router.get("/public/:uuid", async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const [userRows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE public_id = ?`,
      [uuid],
    );
    if (userRows.length === 0)
      return res.status(404).json({ errorMessage: "User not found" });

    const userId = userRows[0].id as number;
    const query = `${WEAVE_QUERY_BASE} WHERE (w.giver_id = ? OR w.receiver_id = ?) GROUP BY w.id ORDER BY w.created_at DESC`;
    const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [userId, userId]);
    const processed = await processWeaveRows(weaveRows);
    return res.status(200).json({ weaves: processed });
  } catch {
    res.status(500).json({ errorMessage: "Failed" });
  }
});

export default router;
