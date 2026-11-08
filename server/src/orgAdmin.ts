//* 組織管理員後台（PRD 0001 §5.1、ADR 0003）：Org Admin 管理自己組織的單位與成員
//* 權限：每個 `/orgs/:orgId` 底下的請求先確認呼叫者是該組織的 Org Admin 或 Platform Admin，
//* 否則一律 404 ORG_NOT_FOUND
import Router, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "./middleware/auth";
import { HttpError } from "./utils/httpError";
import { announceAutoDeclined } from "./utils/weaveService";
import { orgHandoverService } from "./services/orgHandoverService";
import { getOrgReport } from "./services/orgReportService";
import { OrgIdSchema } from "./utils/idSchemas";
import { orgNotFound, orgService, OrgSummary } from "./services/orgService";
import { AUTO_RELEASE_MAX_DAYS } from "./services/orgAutoReleaseService";
import { PUBLISHER_DISPLAYS } from "./services/orgPublisher";
import {
  AdminOrg,
  MEMBER_ROLES,
  OrgAdminCaller,
  orgMemberService,
} from "./services/orgMemberService";

const router = Router();

router.use(requireAuth);

//* 表單內容（使用者輸入）→ 失敗時 next(zodError) 回 VALIDATION_FAILED
const CreateUnitSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

const AddMemberFormSchema = z.object({
  email: z.string().trim().pipe(z.email("Invalid email")),
  role: z.enum(MEMBER_ROLES),
});

//* 單位 id 由 client 從清單帶入 → 格式錯是 client bug（INVALID_REQUEST）
const UnitIdsSchema = z.array(z.number().int().positive()).max(100).default([]);
const MemberIdSchema = z.coerce.number().int().positive();

//* 改身分：身分選單與單位勾選都由 client 帶入，沒有使用者打字的欄位 → INVALID_REQUEST
const UpdateMemberSchema = z.object({
  role: z.enum(MEMBER_ROLES),
  unitIds: z.array(z.number().int().positive()).max(100),
});

//* 交接：交出的人、單位、接手的人都由 client 從待交接清單與窗口選單帶入 → INVALID_REQUEST
const HandoverSchema = z.object({
  fromUserId: z.uuid(),
  unitId: z.number().int().positive(),
  toMemberId: z.number().int().positive(),
});

//* 組織設定：Org Admin 能改 Auto Release（#139）與公開層顯示（#140）；名稱、演示組織由 Platform Admin 管（admin.ts）
//* 開關與天數是使用者在表單輸入 → VALIDATION_FAILED
const OrgSettingsSchema = z
  .object({
    autoReleaseEnabled: z.boolean(),
    autoReleaseDays: z.number().int().min(1).max(AUTO_RELEASE_MAX_DAYS),
  })
  .partial();
//* 公開層顯示是選單帶入的值 → 格式錯是 client bug（INVALID_REQUEST）
const PublisherDisplaySettingSchema = z.object({
  publisherDisplay: z.enum(PUBLISHER_DISPLAYS).optional(),
});

function settingsView(org: OrgSummary) {
  return {
    autoReleaseEnabled: org.autoReleaseEnabled,
    autoReleaseDays: org.autoReleaseDays,
    publisherDisplay: org.publisherDisplay,
  };
}

function adminOrg(res: Response): AdminOrg {
  return res.locals.adminOrg as AdminOrg;
}

function caller(req: Request): OrgAdminCaller {
  return {
    userId: req.user!.userId,
    isPlatformAdmin: req.user!.role === "admin",
  };
}

/**
 * GET /api/org-admin/orgs
 * 呼叫者能管理的組織（Platform Admin 看到全部）
 */
router.get("/orgs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgs = await orgMemberService.listAdminOrgs(caller(req));
    return res.status(200).json({ orgs });
  } catch (error) {
    return next(error);
  }
});

router.use(
  "/orgs/:orgId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = OrgIdSchema.safeParse(req.params.orgId);
      if (!orgId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid org id"));
      }
      res.locals.adminOrg = await orgMemberService.requireAdminOrg(
        orgId.data,
        caller(req),
      );
      return next();
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/org-admin/orgs/:orgId
 * 組織的單位與成員
 */
router.get(
  "/orgs/:orgId",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const org = adminOrg(res);
      const [units, members] = await Promise.all([
        orgMemberService.listUnits(org.id),
        orgMemberService.listMembers(org.id),
      ]);
      return res.status(200).json({
        org: { id: org.publicId, name: org.name },
        units,
        members,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/org-admin/orgs/:orgId/settings
 * 組織的 Auto Release 與公開層顯示設定
 */
router.get(
  "/orgs/:orgId/settings",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await orgService.getOrganization(adminOrg(res).publicId);
      if (!org) return next(orgNotFound());
      return res.status(200).json({ settings: settingsView(org) });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * PATCH /api/org-admin/orgs/:orgId/settings
 * 改 Auto Release（自動＋天數或手動）與公開層顯示（組織名稱／組織＋單位／匿名）；只更新有傳入的欄位
 */
router.patch(
  "/orgs/:orgId/settings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const display = PublisherDisplaySettingSchema.safeParse(req.body ?? {});
      if (!display.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid publisher display"));
      }
      const parsed = OrgSettingsSchema.safeParse(req.body ?? {});
      if (!parsed.success) return next(parsed.error);
      const org = await orgService.updateOrganization(adminOrg(res).publicId, {
        ...parsed.data,
        ...display.data,
      });
      if (!org) return next(orgNotFound());
      return res.status(200).json({ settings: settingsView(org) });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/org-admin/orgs/:orgId/units
 * 建立單位（只有一層）
 */
router.post(
  "/orgs/:orgId/units",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateUnitSchema.safeParse(req.body ?? {});
      if (!parsed.success) return next(parsed.error);
      const unit = await orgMemberService.createUnit(
        adminOrg(res).id,
        parsed.data.name,
      );
      return res.status(201).json({ unit });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/org-admin/orgs/:orgId/members
 * 以 email 加入已註冊帳號：`role` 是 Org Admin 或 Org Member，`unitIds` 是擔任 Unit Contact 的單位（可空、可和 Org Admin 並存）
 */
router.post(
  "/orgs/:orgId/members",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const form = AddMemberFormSchema.safeParse(body);
      if (!form.success) return next(form.error);
      const unitIds = UnitIdsSchema.safeParse(body.unitIds);
      if (!unitIds.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid unit ids"));
      }

      const member = await orgMemberService.addMember(adminOrg(res).id, {
        ...form.data,
        unitIds: unitIds.data,
      });
      return res.status(201).json({ member });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * PATCH /api/org-admin/orgs/:orgId/members/:memberId
 * 改成員的身分（Org Admin／Org Member 與窗口單位整組取代）；組織至少要留一位 Org Admin。
 * 拿掉的窗口單位：他代表那些單位送出的 Requested 申請自動婉拒並通知
 */
router.patch(
  "/orgs/:orgId/members/:memberId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memberId = MemberIdSchema.safeParse(req.params.memberId);
      const identity = UpdateMemberSchema.safeParse(req.body ?? {});
      if (!memberId.success || !identity.success) {
        return next(
          new HttpError(400, "INVALID_REQUEST", "Invalid member update"),
        );
      }
      const org = adminOrg(res);
      const { member, declined } = await orgMemberService.updateMember(
        org.id,
        memberId.data,
        identity.data,
      );
      await announceAutoDeclined(res.locals.io ?? null, declined, {
        id: req.user!.userId,
        name: org.name,
      });
      return res.status(200).json({ member });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * DELETE /api/org-admin/orgs/:orgId/members/:memberId
 * 移除成員身分（帳號本身保留）；組織至少要留一位 Org Admin。
 * 他已沒資格的 Requested 申請自動婉拒並通知；經手的物品與 Approved Weave 留給交接
 */
router.delete(
  "/orgs/:orgId/members/:memberId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memberId = MemberIdSchema.safeParse(req.params.memberId);
      if (!memberId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid member id"));
      }
      const org = adminOrg(res);
      const declined = await orgMemberService.removeMember(
        org.id,
        memberId.data,
      );
      await announceAutoDeclined(res.locals.io ?? null, declined, {
        id: req.user!.userId,
        name: org.name,
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/org-admin/orgs/:orgId/report
 * 組織報表（E6-1、E6-2）：流通件數、各層去化比例、各單位統計、估算重量／價值／避免排放量
 */
router.get(
  "/orgs/:orgId/report",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await getOrgReport(adminOrg(res).id);
      return res.status(200).json({ report });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/org-admin/orgs/:orgId/handovers
 * 待交接：還經手著某單位物品、但已不是該單位窗口（離職或異動）的人，依單位列出
 */
router.get(
  "/orgs/:orgId/handovers",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const handovers = await orgHandoverService.listPending(adminOrg(res).id);
      return res.status(200).json({ handovers });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/org-admin/orgs/:orgId/handovers
 * 把某人在某單位經手的物品與進行中的 Weave 轉給該單位另一位窗口（E8-1）
 */
router.post(
  "/orgs/:orgId/handovers",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = HandoverSchema.safeParse(req.body ?? {});
      if (!input.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid handover"));
      }
      const result = await orgHandoverService.handOver(
        adminOrg(res).id,
        input.data,
        req.user!.userId,
        res.locals.io ?? null,
      );
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
