//* 組織管理員後台（PRD 0001 §5.1、ADR 0003）：Org Admin 管理自己組織的單位與成員
//* 權限：每個 `/orgs/:orgId` 底下的請求先確認呼叫者是該組織的 Org Admin，否則一律 404 ORG_NOT_FOUND
import Router, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "./middleware/auth";
import { HttpError } from "./utils/httpError";
import {
  AdminOrg,
  MEMBER_ROLES,
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
const OrgIdSchema = z.uuid();
const MemberIdSchema = z.coerce.number().int().positive();

function adminOrg(res: Response): AdminOrg {
  return res.locals.adminOrg as AdminOrg;
}

/**
 * GET /api/org-admin/orgs
 * 呼叫者擔任 Org Admin 的組織
 */
router.get("/orgs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgs = await orgMemberService.listAdminOrgs(req.user!.userId);
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
        req.user!.userId,
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
 * 以 email 加入已註冊帳號，指定為 Org Admin、Unit Contact（一或多個單位）或 Org Member
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

      const isUnitContact = form.data.role === "unit_contact";
      if (isUnitContact && unitIds.data.length === 0) {
        //* 使用者選了 Unit Contact 但沒勾單位：表單問題
        return next(
          new HttpError(
            400,
            "UNIT_CONTACT_NEEDS_UNIT",
            "A Unit Contact needs at least one unit",
          ),
        );
      }
      if (!isUnitContact && unitIds.data.length > 0) {
        return next(
          new HttpError(
            400,
            "INVALID_REQUEST",
            "Only a Unit Contact can have units",
          ),
        );
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
 * DELETE /api/org-admin/orgs/:orgId/members/:memberId
 * 移除成員身分（帳號本身保留）；組織至少要留一位 Org Admin
 */
router.delete(
  "/orgs/:orgId/members/:memberId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const memberId = MemberIdSchema.safeParse(req.params.memberId);
      if (!memberId.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid member id"));
      }
      await orgMemberService.removeMember(adminOrg(res).id, memberId.data);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
