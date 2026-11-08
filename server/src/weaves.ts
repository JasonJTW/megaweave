// server/src/weaves.ts

import Router, { Request, Response, NextFunction } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import {
  requestWeave,
  approveWeave,
  listActingUnits,
} from "./utils/weaveService";
import { ConnectionAcquireTimeoutError } from "./utils/acquireConnection";
import { WeaveStatus } from "./utils/weaveService";
import { buildWeavesFilter, WeavesListQuerySchema } from "./utils/weaveQuery";
import { enqueueUserVectorUpdate } from "./queue/queues";
import { HttpError } from "./utils/httpError";
import { z } from "zod";
import { publicSurfaceCondition } from "./services/postVisibility";
import { maskOrgPublishers } from "./services/orgPublisher";
const router = Router();

const ActingUnitIdSchema = z.number().int().positive().nullable().optional();
const ActingUnitsQuerySchema = z.object({
  postId: z.coerce.number().int().positive(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeaveItemRow {
  id: number;
  weave_id: number;
  item_id: number | null;
  quantity: number;
  title: string | null;
}

export interface WeaveOutput extends RowDataPacket {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  receiver_org_unit_id: number | null;
  status: WeaveStatus;
  giver_confirmed: number;
  receiver_confirmed: number;
  notes: string | null;
  conversation_id: number | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  post_id_original: number;
  post_public_id: string;
  post_user_id: number;
  post_author_public_id?: string;
  post_author_username?: string;
  post_author_avatar?: string | null;
  post_title: string;
  post_content: string;
  post_type: "wish" | "share" | "commons";
  post_status_original: "active" | "inactive" | "expired";
  post_location: string | null;
  post_place_id?: string | null;
  post_location_name?: string | null;
  post_location_url?: string | null;
  post_province?: string | null;
  post_city?: string | null;
  post_route?: string | null;
  post_zip_code?: string | null;
  post_lat?: number | null;
  post_lng?: number | null;
  post_tags: string | null;
  post_category_id: number;
  post_condition_level: number;
  post_expires_at: Date | null;
  post_view_count: number;
  post_likes_count: number;
  post_created_at: Date;
  post_updated_at: Date;
  post_comment_count: number;
  post_org_id: number | null;
  post_org_unit_id?: number | null;
  giver_name: string;
  giver_avatar: string | null;
  receiver_name: string;
  receiver_avatar: string | null;
  receiver_org_unit_name: string | null;
  s3_keys: string | null;
}

// ─── Shared SQL ───────────────────────────────────────────────────────────────

export const WEAVE_QUERY_BASE = `
  SELECT 
      w.*,
      p.id AS post_id_original,
      p.public_id AS post_public_id,
      p.user_id AS post_user_id,
      post_author.public_id AS post_author_public_id,
      COALESCE(NULLIF(TRIM(p_up.custom_name), ''), post_author.username) AS post_author_username,
      post_author.avatar_url AS post_author_avatar,
      p.title AS post_title,
      p.content AS post_content,
      p.type AS post_type,
      p.status AS post_status_original,
      l.full_address AS post_location, 
      l.place_id AS post_place_id,
      l.name AS post_location_name,
      l.url AS post_location_url,
      l.province AS post_province,
      l.city AS post_city,
      l.route AS post_route,
      l.zip_code AS post_zip_code,
      l.lat AS post_lat,
      l.lng AS post_lng,
      p.tags AS post_tags,
      p.category_id AS post_category_id,
      p.condition_level AS post_condition_level,
      p.expires_at AS post_expires_at,
      p.view_count AS post_view_count,
      p.likes_count AS post_likes_count,
      p.created_at AS post_created_at,
      p.updated_at AS post_updated_at,
      p.comment_count AS post_comment_count,
      p.org_id AS post_org_id,
      p.org_unit_id AS post_org_unit_id,
      COALESCE(NULLIF(TRIM(g_up.custom_name), ''), giver.username) AS giver_name,
      giver.avatar_url AS giver_avatar,
      COALESCE(NULLIF(TRIM(r_up.custom_name), ''), receiver.username) AS receiver_name,
      receiver.avatar_url AS receiver_avatar,
      receiver_unit.name AS receiver_org_unit_name,
      GROUP_CONCAT(img.s3_key ORDER BY img.id ASC) AS s3_keys
  FROM weaves w
  JOIN posts p ON w.post_id = p.id
  LEFT JOIN users post_author ON p.user_id = post_author.id
  LEFT JOIN user_profiles p_up ON post_author.id = p_up.user_id
  LEFT JOIN locations l ON p.location_id = l.id
  JOIN users giver ON w.giver_id = giver.id
  LEFT JOIN user_profiles g_up ON giver.id = g_up.user_id
  JOIN users receiver ON w.receiver_id = receiver.id
  LEFT JOIN user_profiles r_up ON receiver.id = r_up.user_id
  LEFT JOIN org_units receiver_unit ON receiver_unit.id = w.receiver_org_unit_id
  LEFT JOIN images img ON p.id = img.post_id
`;

export interface ProcessWeaveRowsOptions {
  /**
   * 是否附上流向單位（ADR 0004）。公開個人頁傳 false：單位名稱是組織內部資訊，不給組織外的人看
   */
  includeReceiverOrgUnit?: boolean;
  /**
   * 看這些 Weave 的人；組織物品的 Giver 與發文者對不是該組織成員的人以組織名義顯示（#140、ADR 0004）。
   * 省略（公開個人頁）= 一律遮蔽
   */
  viewerUserId?: number;
}

/** 檢視者是哪些組織的成員（只查這批 Weave 涉及的組織） */
async function memberOrgIds(viewerUserId: number | undefined, orgIds: number[]): Promise<Set<number>> {
  if (viewerUserId === undefined || orgIds.length === 0) return new Set();
  const [rows] = await dbPool.query<RowDataPacket[]>(
    "SELECT org_id FROM org_memberships WHERE user_id = ? AND org_id IN (?)",
    [viewerUserId, orgIds],
  );
  return new Set(rows.map((row) => Number(row.org_id)));
}

export async function processWeaveRows(
  weaveRows: WeaveOutput[],
  { includeReceiverOrgUnit = true, viewerUserId }: ProcessWeaveRowsOptions = {},
) {
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

  const orgIds = [
    ...new Set(weaveRows.flatMap((r) => (r.post_org_id == null ? [] : [Number(r.post_org_id)]))),
  ];
  const memberOf = await memberOrgIds(viewerUserId, orgIds);
  const masked = (row: WeaveOutput) =>
    row.post_org_id != null && !memberOf.has(Number(row.post_org_id));

  const output = weaveRows.map((row) => {
    const post = {
      id: row.post_id_original,
      public_id: row.post_public_id,
      user_id: row.post_user_id,
      author_user_id: row.post_user_id,
      author_public_id: row.post_author_public_id,
      username: row.post_author_username,
      avatar_url: row.post_author_avatar,
      title: row.post_title,
      content: row.post_content,
      type: row.post_type,
      status: row.post_status_original,
      location: row.post_location,
      full_address: row.post_location || row.post_location_name || "",
      place_id: row.post_place_id,
      location_name: row.post_location_name,
      location_url: row.post_location_url,
      province: row.post_province,
      city: row.post_city,
      route: row.post_route,
      zip_code: row.post_zip_code,
      lat: row.post_lat,
      lng: row.post_lng,
      tags: row.post_tags,
      category_id: row.post_category_id,
      condition_level: row.post_condition_level,
      expires_at: row.post_expires_at,
      view_count: row.post_view_count,
      likes_count: row.post_likes_count,
      created_at: row.post_created_at,
      updated_at: row.post_updated_at,
      comment_count: row.post_comment_count,
      // 組織物品不開放 ECPay／Lalamove（PRD 0001 §5.1），client 依此隱藏運費報價
      org_id: row.post_org_id ?? null,
      org_unit_id: row.post_org_unit_id ?? null,
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
      // 經手人是 receiver_id；物品流向的單位（個人 Weave 為 null）
      receiver_org_unit:
        includeReceiverOrgUnit && row.receiver_org_unit_id != null
          ? {
              id: Number(row.receiver_org_unit_id),
              name: row.receiver_org_unit_name ?? "",
            }
          : null,
      giver_confirmed: Boolean(row.giver_confirmed),
      receiver_confirmed: Boolean(row.receiver_confirmed),
      conversation_id: row.conversation_id ?? undefined,
      post,
    };
  });

  //* 組織物品的 Giver 就是經手窗口（組織只發 Share）：和發文者一起換成組織名義
  const maskedOutput = output.filter((_, i) => masked(weaveRows[i]));
  await maskOrgPublishers(
    dbPool,
    maskedOutput.map((w) => w.post),
  );
  for (const weave of maskedOutput) {
    Object.assign(weave, {
      giver_name: weave.post.username,
      giver_avatar: null,
      giver_id: null,
    });
  }
  return output;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST / - 建立 Weave 請求
router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const { postId, itemId, quantity = 1, notes } = req.body;

    if (!postId)
      return next(new HttpError(400, "INVALID_REQUEST", "Post ID is required"));

    // 「代表誰」（ADR 0004）：省略、null（我個人）或單位 id；能否代表由 weaveService 判斷
    const actingUnit = ActingUnitIdSchema.safeParse(req.body.actingUnitId);
    if (!actingUnit.success)
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid acting unit"));

    // Normalise items: support array format and legacy single-item format
    interface IncomingItem {
      itemId?: number;
      item_id?: number;
      quantity?: number;
    }
    let items: Array<{ itemId: number | null; quantity: number }> = [];
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      items = req.body.items.map((it: IncomingItem) => ({
        itemId:
          it.itemId || it.item_id ? Number(it.itemId ?? it.item_id) : null,
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
          actingUnitId: actingUnit.data,
          initiator: {
            id: Number(req.user!.userId),
            name: req.user?.username ?? "Someone",
            publicId: req.user!.public_id,
          },
        },
        res.locals.io ?? null,
      );
      // 🧠 觸發使用者興趣向量更新（fire-and-forget）
      enqueueUserVectorUpdate({
        userId: Number(req.user!.userId),
        postId: Number(postId),
        action: "weave",
      }).catch((err) =>
        console.error("Failed to enqueue user-vector (weave):", err),
      );

      return res.status(201).json({
        message: "Weave request sent successfully",
        weaveId: result.weaveId,
        notificationSent: result.notificationSent,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// GET / - 獲取我的交易列表
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const parsed = WeavesListQuerySchema.safeParse(req.query);
      if (!parsed.success)
        return next(
          new HttpError(400, "INVALID_REQUEST", "Invalid query parameters"),
        );

      const { whereClause, params } = buildWeavesFilter({
        userId,
        ...parsed.data,
      });

      const query = `${WEAVE_QUERY_BASE} ${whereClause} GROUP BY w.id ORDER BY w.created_at DESC`;
      const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, params);
      const weaves = await processWeaveRows(weaveRows, { viewerUserId: userId });
      return res.status(200).json({ weaves });
    } catch (error) {
      return next(error);
    }
  },
);

// GET /acting-units?postId= - 申請時可代表的單位（ADR 0004）；空陣列 = 不顯示「代表誰」
router.get(
  "/acting-units",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const query = ActingUnitsQuerySchema.safeParse(req.query);
    if (!query.success)
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid post id"));
    try {
      const units = await listActingUnits(
        query.data.postId,
        Number(req.user!.userId),
      );
      return res.status(200).json({ units });
    } catch (error) {
      return next(error);
    }
  },
);

// GET /:id - 獲取單筆交易紀錄
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const weaveId = req.params.id;
      const query = `${WEAVE_QUERY_BASE} WHERE w.id = ? AND (w.giver_id = ? OR w.receiver_id = ?) GROUP BY w.id`;
      const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [
        weaveId,
        userId,
        userId,
      ]);
      if (weaveRows.length === 0)
        return next(new HttpError(404, "WEAVE_NOT_FOUND", "Weave not found"));
      const processed = await processWeaveRows(weaveRows, { viewerUserId: userId });
      return res.status(200).json({ weave: processed[0] });
    } catch (error) {
      return next(error);
    }
  },
);

// PATCH /:id/status - 更新 Weave 狀態（雙向確認流程）
router.patch(
  "/:id/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await approveWeave(
        {
          weaveId: req.params.id,
          newStatus: req.body.status,
          userId: Number(req.user!.userId),
          actorName: req.user!.username,
        },
        res.locals.io ?? null,
      );

      return res.status(200).json({
        message: result.fullyCompleted ? "Success" : "Waiting",
        newStatus: result.newStatus,
        fullyCompleted: result.fullyCompleted,
      });
    } catch (err) {
      if (err instanceof ConnectionAcquireTimeoutError) {
        console.error("approveWeave: DB pool exhausted:", err);
        return next(
          new HttpError(
            503,
            "SERVICE_UNAVAILABLE",
            "Server busy, please try again",
          ),
        );
      }
      return next(err);
    }
  },
);

// GET /public/:uuid - 公開交易紀錄
router.get(
  "/public/:uuid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uuid } = req.params;
      const [userRows] = await dbPool.execute<RowDataPacket[]>(
        `SELECT id FROM users WHERE public_id = ?`,
        [uuid],
      );
      if (userRows.length === 0)
        return next(new HttpError(404, "USER_NOT_FOUND", "User not found"));

      const userId = userRows[0].id as number;
      // 公開個人頁：只列個人貼文與 Public 組織貼文的交換（ADR 0003）；
      // 以窗口身分交出組織物品的不列（#140、ADR 0004：會曝光經手的人），領取組織物品的照列，Giver 以組織名義顯示
      const query = `${WEAVE_QUERY_BASE} WHERE (w.giver_id = ? OR w.receiver_id = ?) AND ${publicSurfaceCondition("p")} AND NOT (p.org_id IS NOT NULL AND w.giver_id = ?) GROUP BY w.id ORDER BY w.created_at DESC`;
      const [weaveRows] = await dbPool.execute<WeaveOutput[]>(query, [
        userId,
        userId,
        userId,
      ]);
      const processed = await processWeaveRows(weaveRows, {
        includeReceiverOrgUnit: false,
      });
      return res.status(200).json({ weaves: processed });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
