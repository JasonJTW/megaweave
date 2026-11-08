//* 組織物品與組織頁（#136，PRD 0001 §5.1、ADR 0003、ADR 0005）
//* `/api/orgs/:orgId/*` 先確認呼叫者是該組織成員，否則一律 404 ORG_NOT_FOUND（含 Platform Admin：
//* 可見範圍只來自 membership）。能管哪些單位由 orgItemService 判斷，不符回 403 ORG_UNIT_NOT_MANAGED。
import Router, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "./middleware/auth";
import { HttpError } from "./utils/httpError";
import { OrgIdSchema } from "./utils/idSchemas";
import { AUDIENCE_TIERS } from "./services/postVisibility";
import {
  listOrgItemCategories,
  ORG_ITEM_CATEGORY_IDS,
} from "./services/orgItemCategories";
import { AUTO_RELEASE_MAX_DAYS } from "./services/orgAutoReleaseService";
import {
  ItemAutoReleaseInput,
  ORG_ITEM_STATUSES,
  ORG_ITEM_WEAVE_STATUSES,
  OrgAccess,
  orgItemService,
} from "./services/orgItemService";

const router = Router();
const UPLOAD_IMAGE_LIMIT = parseInt(process.env.UPLOAD_IMAGE_LIMIT || "5", 10);

//* 使用者打字的欄位 → 失敗時 next(zodError) 回 VALIDATION_FAILED
const ItemFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(60, "Title too long"),
  content: z.string().trim().max(1000, "Content too long").default(""),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10000),
  //* 必填；有預設重量的類別由 client 預填，沒有的（如塑膠製品）要使用者自己填
  unitWeightKg: z
    .number({ error: "Weight is required" })
    .positive("Weight must be greater than 0")
    .max(100000),
  assetNumber: z
    .string()
    .trim()
    .max(100, "Asset number too long")
    .nullish()
    .transform((v) => (v ? v : null)),
  estimatedValueTwd: z
    .number()
    .int()
    .min(0, "Value cannot be negative")
    .max(2_000_000_000)
    .nullish()
    .transform((v) => v ?? null),
});

//* 選單與 client 帶入的值 → 格式錯是 client bug（INVALID_REQUEST）
const ItemSelectionSchema = z.object({
  unitId: z.number().int().positive(),
  orgCategory: z.enum(ORG_ITEM_CATEGORY_IDS),
  conditionLevel: z.number().int().min(1).max(5),
  stagingKeys: z
    .array(z.string().regex(/^staging\/posts\/[\w.-]+$/))
    .max(UPLOAD_IMAGE_LIMIT)
    .default([]),
});

const ItemFiltersSchema = z.object({
  unitId: z.coerce.number().int().positive().optional(),
  tier: z.enum(AUDIENCE_TIERS).optional(),
  status: z.enum(ORG_ITEM_STATUSES).optional(),
  weaveStatus: z.enum(ORG_ITEM_WEAVE_STATUSES).optional(),
});

const ItemIdSchema = z.uuid();

function orgAccess(res: Response): OrgAccess {
  return res.locals.orgAccess as OrgAccess;
}

function accessView(access: OrgAccess) {
  return {
    id: access.publicId,
    name: access.name,
    accessLevel: access.accessLevel,
    isAdmin: access.isAdmin,
    manageableUnits: access.manageableUnits,
    autoRelease: access.autoRelease,
    isDemo: access.isDemo,
  };
}

/**
 * GET /api/orgs/item-categories
 * 上架表單的類別、預設重量與出處（來自避免排放量係數表）
 */
router.get("/item-categories", (_req: Request, res: Response) => {
  return res.status(200).json(listOrgItemCategories());
});

router.use(requireAuth);

/**
 * GET /api/orgs
 * 呼叫者所屬的組織（組織頁切換器），附能管理的單位
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accesses = await orgItemService.listAccesses(req.user!.userId);
    return res.status(200).json({ orgs: accesses.map(accessView) });
  } catch (error) {
    return next(error);
  }
});

router.use(
  "/:orgId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = OrgIdSchema.safeParse(req.params.orgId);
      if (!orgId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid org id"));
      }
      res.locals.orgAccess = await orgItemService.requireAccess(
        orgId.data,
        req.user!.userId,
      );
      return next();
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/orgs/:orgId
 * 呼叫者在這個組織的身分
 */
router.get("/:orgId", (_req: Request, res: Response) => {
  return res.status(200).json({ org: accessView(orgAccess(res)) });
});

/**
 * GET /api/orgs/:orgId/posts
 * 組織頁：呼叫者層級看得到的上架中物品
 */
router.get(
  "/:orgId/posts",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const posts = await orgItemService.listOrgPagePosts(orgAccess(res));
      return res.status(200).json({ posts });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/orgs/:orgId/items?unitId=&tier=&status=
 * 後台清單：Unit Contact 看自己單位，Org Admin 看全組織
 */
router.get(
  "/:orgId/items",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = ItemFiltersSchema.safeParse(req.query);
      if (!filters.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid filters"));
      }
      const items = await orgItemService.listManagedItems(
        orgAccess(res),
        filters.data,
      );
      return res.status(200).json({ items });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/orgs/:orgId/items/:itemId/requests
 * 後台：一件物品的申請（經手人、流向單位）；只給能管這個單位的窗口或 Org Admin
 */
router.get(
  "/:orgId/items/:itemId/requests",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      if (!itemId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item id"));
      }
      const requests = await orgItemService.listItemRequests(
        orgAccess(res),
        itemId.data,
      );
      return res.status(200).json({ requests });
    } catch (error) {
      return next(error);
    }
  },
);

const TierChangeSchema = z.object({ tier: z.enum(AUDIENCE_TIERS) });

/**
 * PATCH /api/orgs/:orgId/items/:itemId/tier
 * 改物品層級：Unit Contact 只能把自己單位的物品升到 Members，Org Admin 可升降（含從 Public 降級）；
 * 升到 Public 走 pending-public
 */
router.patch(
  "/:orgId/items/:itemId/tier",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      const body = TierChangeSchema.safeParse(req.body ?? {});
      if (!itemId.success || !body.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid tier change"));
      }
      const item = await orgItemService.changeItemTier(
        orgAccess(res),
        req.user!.userId,
        itemId.data,
        body.data.tier,
        res.locals.io ?? null,
      );
      return res.status(200).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

//* 確認框的勾選是 client 帶入的布林值，格式錯 → INVALID_REQUEST
const PendingPublicSchema = z.object({
  assetDisposalConfirmed: z.boolean().default(false),
});

/**
 * POST /api/orgs/:orgId/items/:itemId/pending-public
 * Org Admin 把物品送進 10 分鐘待公開期（#140）。有財產編號的要帶 `assetDisposalConfirmed: true`，
 * 否則 400 ORG_ASSET_DISPOSAL_UNCONFIRMED；Unit Contact → 403 ORG_TIER_NOT_ALLOWED
 */
router.post(
  "/:orgId/items/:itemId/pending-public",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      const body = PendingPublicSchema.safeParse(req.body ?? {});
      if (!itemId.success || !body.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid pending public request"));
      }
      const item = await orgItemService.startPendingPublic(
        orgAccess(res),
        req.user!.userId,
        itemId.data,
        body.data,
      );
      return res.status(200).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * DELETE /api/orgs/:orgId/items/:itemId/pending-public
 * 取消待公開，維持原層級並留下紀錄；已經公開 → 409 ORG_PENDING_PUBLIC_NOT_PENDING
 */
router.delete(
  "/:orgId/items/:itemId/pending-public",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      if (!itemId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item id"));
      }
      const item = await orgItemService.cancelPendingPublic(
        orgAccess(res),
        req.user!.userId,
        itemId.data,
      );
      return res.status(200).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/orgs/:orgId/items/:itemId/pending-public/skip
 * 只有演示組織的管理員能跳過待公開期、立即公開；其他組織 → 403 ORG_PENDING_PUBLIC_SKIP_NOT_ALLOWED
 */
router.post(
  "/:orgId/items/:itemId/pending-public/skip",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      if (!itemId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item id"));
      }
      const item = await orgItemService.skipPendingPublic(
        orgAccess(res),
        req.user!.userId,
        itemId.data,
        res.locals.io ?? null,
      );
      return res.status(200).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

//* 模式是選單（client bug → INVALID_REQUEST），天數是使用者打字（VALIDATION_FAILED）
const AutoReleaseModeSchema = z.object({ mode: z.enum(["org", "auto", "manual"]) });
const AutoReleaseDaysSchema = z.object({
  days: z.number({ error: "Days is required" }).int().min(1).max(AUTO_RELEASE_MAX_DAYS),
});

/**
 * PATCH /api/orgs/:orgId/items/:itemId/auto-release
 * 單件 Auto Release 覆寫（#139）body `{ mode: 'org' | 'manual' }` 或 `{ mode: 'auto', days }`；
 * 只給能管這個單位的窗口或 Org Admin
 */
router.patch(
  "/:orgId/items/:itemId/auto-release",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      const mode = AutoReleaseModeSchema.safeParse(body);
      if (!itemId.success || !mode.success || (mode.data.mode !== "auto" && body.days !== undefined)) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid auto release setting"));
      }
      let input: ItemAutoReleaseInput;
      if (mode.data.mode === "auto") {
        const days = AutoReleaseDaysSchema.safeParse(body);
        if (!days.success) return next(days.error);
        input = { mode: "auto", days: days.data.days };
      } else {
        input = { mode: mode.data.mode };
      }
      const item = await orgItemService.setItemAutoRelease(orgAccess(res), itemId.data, input);
      return res.status(200).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/orgs/:orgId/items/:itemId/tier-events
 * 物品的層級紀錄；只給能管這個單位的窗口或 Org Admin
 */
router.get(
  "/:orgId/items/:itemId/tier-events",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      if (!itemId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item id"));
      }
      const events = await orgItemService.listItemTierEvents(
        orgAccess(res),
        itemId.data,
      );
      return res.status(200).json({ events });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/orgs/:orgId/items/:itemId/timeline
 * 物品流轉時間軸（上架、層級、交接、申請、核可、完成），每一步有操作者與時間；
 * 只給能管這個單位的窗口或 Org Admin。紀錄只能讀，沒有修改或刪除的路由
 */
router.get(
  "/:orgId/items/:itemId/timeline",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const itemId = ItemIdSchema.safeParse(req.params.itemId);
      if (!itemId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item id"));
      }
      const timeline = await orgItemService.listItemTimeline(
        orgAccess(res),
        itemId.data,
      );
      return res.status(200).json({ timeline });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/orgs/:orgId/items
 * 代表單位上架 Share，上架後在 Internal；type、層級與付款方式都不由 client 決定
 */
router.post(
  "/:orgId/items",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const selection = ItemSelectionSchema.safeParse(body);
      if (!selection.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid item selection"));
      }
      const form = ItemFormSchema.safeParse(body);
      if (!form.success) return next(form.error);

      const item = await orgItemService.createItem(
        orgAccess(res),
        req.user!.userId,
        { ...selection.data, ...form.data },
      );
      return res.status(201).json({ item });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
