import Router, { Request, Response, NextFunction } from "express";
import { requireAuth, requireRole } from "./middleware/auth";
import dbPool from "./utils/db";
import { getRedisClient } from "./utils/redis";
import { z } from "zod";
import { HttpError } from "./utils/httpError";
import {
  orgNotFound,
  orgService,
  PUBLISHER_DISPLAYS,
} from "./services/orgService";
import { OrgIdSchema } from "./utils/idSchemas";

const router = Router();

// 權限防護：本路由下所有操作一律強制需要 admin 角色（驗證 Redis session）
router.use(requireAuth, requireRole("admin"));

/**
 * GET /api/admin/metrics
 * 系統與資料庫全域狀態監控指標 (Privileged Metrics API)
 */
router.get(
  "/metrics",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const memUsage = process.memoryUsage();

      let dbStatus = "connected";
      try {
        await dbPool.query("SELECT 1");
      } catch {
        dbStatus = "disconnected";
      }

      let redisStatus = "connected";
      try {
        const redis = getRedisClient();
        if (!redis.isOpen) {
          redisStatus = "disconnected";
        }
      } catch {
        redisStatus = "disconnected";
      }

      return res.status(200).json({
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
        },
        dbStatus,
        redisStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/admin/cleanup
 * 系統定時與手動資源清理作業 (Privileged Cleanup API)
 */
router.post(
  "/cleanup",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // 範例清理作業：清理軟刪除殘留或快取日誌
      return res.status(200).json({
        message: "Admin cleanup executed successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  },
);

//* ── 組織開通（PRD 0001 §5.1、ADR 0003）：只有 Platform Admin（全站 role = admin）能建立與編輯 ──

//* 表單內容（使用者輸入）→ 失敗時 next(zodError) 回 VALIDATION_FAILED
const orgSettingsShape = {
  name: z.string().trim().min(1, "Name is required").max(100),
  publisherDisplay: z.enum(PUBLISHER_DISPLAYS),
  isDemo: z.boolean(),
  autoReleaseEnabled: z.boolean(),
  autoReleaseDays: z.number().int().min(1).max(365),
};

const CreateOrgSchema = z.object({
  ...orgSettingsShape,
  publisherDisplay: orgSettingsShape.publisherDisplay.default("org"),
  isDemo: orgSettingsShape.isDemo.default(false),
  autoReleaseEnabled: orgSettingsShape.autoReleaseEnabled.default(true),
  autoReleaseDays: orgSettingsShape.autoReleaseDays.default(30),
  orgAdminEmail: z.string().trim().pipe(z.email("Invalid email")),
});

const UpdateOrgSchema = z.object(orgSettingsShape).partial();

function parseOrgId(id: string) {
  const parsed = OrgIdSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

/**
 * GET /api/admin/orgs
 * 列出所有組織與其 Org Admin
 */
router.get(
  "/orgs",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orgs = await orgService.listOrganizations();
      return res.status(200).json({ orgs });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/admin/orgs
 * 建立組織並以已註冊帳號的 email 指定第一位 Org Admin
 */
router.post(
  "/orgs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateOrgSchema.safeParse(req.body ?? {});
      if (!parsed.success) return next(parsed.error);
      const org = await orgService.createOrganization(parsed.data);
      return res.status(201).json({ org });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/admin/orgs/:id
 */
router.get(
  "/orgs/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = parseOrgId(req.params.id);
      if (!orgId) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid org id"));
      }
      const org = await orgService.getOrganization(orgId);
      if (!org) {
        return next(orgNotFound());
      }
      return res.status(200).json({ org });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * PATCH /api/admin/orgs/:id
 * 編輯組織設定（只更新有傳入的欄位）
 */
router.patch(
  "/orgs/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = parseOrgId(req.params.id);
      if (!orgId) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid org id"));
      }
      const parsed = UpdateOrgSchema.safeParse(req.body ?? {});
      if (!parsed.success) return next(parsed.error);
      const org = await orgService.updateOrganization(orgId, parsed.data);
      if (!org) {
        return next(orgNotFound());
      }
      return res.status(200).json({ org });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
