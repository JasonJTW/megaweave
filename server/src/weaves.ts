// server/src/weaves.ts

import Router, { Request, Response, NextFunction } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { requireAuth } from "./middleware/auth";
import {
  actOnWeave,
  commandForTargetStatus,
  listActingUnits,
  processWeaveRows,
  requestWeave,
  WEAVE_QUERY_BASE,
  type WeaveOutput,
  type WeaveStatus,
} from "./services/weave";
import { ConnectionAcquireTimeoutError } from "./utils/acquireConnection";
import { buildWeavesFilter, WeavesListQuerySchema } from "./utils/weaveQuery";
import { enqueueUserVectorUpdate } from "./queue/queues";
import { HttpError } from "./utils/httpError";
import { z } from "zod";
import { publicSurfaceCondition } from "./services/postVisibility";
const router = Router();

const ActingUnitIdSchema = z.number().int().positive().nullable().optional();
const WeaveIdSchema = z.coerce.number().int().positive();
const ActingUnitsQuerySchema = z.object({
  postId: z.coerce.number().int().positive(),
});

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
    const weaveId = WeaveIdSchema.safeParse(req.params.id);
    if (!weaveId.success)
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid weave id"));
    try {
      //* API 收目標狀態，Weave module 收命令（沒有對應的命令 → 400 INVALID_STATUS_TRANSITION）
      const result = await actOnWeave(
        {
          weaveId: weaveId.data,
          command: commandForTargetStatus(req.body?.status as WeaveStatus),
          actor: { id: Number(req.user!.userId), name: req.user!.username },
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
        console.error("actOnWeave: DB pool exhausted:", err);
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
      //* 備註與對話 id 只屬於兩造，公開介面不給
      const weaves = processed.map(
        ({ notes: _notes, conversation_id: _conversationId, ...weave }) => weave,
      );
      return res.status(200).json({ weaves });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
