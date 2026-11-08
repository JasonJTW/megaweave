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
import {
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
