//* 組織管理員後台：單位與成員（PRD 0001 §5.1、ADR 0003、ADR 0004）
//* 一筆 membership 上的兩個身分彼此獨立，同一人可以兩者都有：
//*   Org Admin    → org_role 'admin'（能管什麼）
//*   Unit Contact → 在 org_unit_contacts 掛一或多個單位（能代表哪些單位）
//* access_level（看得到什麼）由這兩者推導：Org Admin 或 Unit Contact → 'internal'，其餘 → 'member'
//* 移除成員刪 membership（org_unit_contacts 由外鍵連帶刪除），同一交易婉拒他已沒資格的 Requested 申請；
//* 他經手的物品與 Approved Weave 留在單位，等 Org Admin 交接（orgHandoverService）
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { withTransaction } from "../utils/transaction";
import {
  DeclinedWeave,
  declineRequestsOfRemovedMember,
} from "./orgHandoverService";
import {
  addMembershipByEmail,
  MembershipGrant,
  ORG_ROLES,
  orgNotFound,
  OrgRole,
  Queryable,
} from "./orgService";

export const MEMBER_ROLES = ORG_ROLES;
export type MemberRole = OrgRole;

/** 身分推導出 access_level：Org Admin 與 Unit Contact 都能看 Internal 層 */
export function membershipGrant(
  role: MemberRole,
  unitIds: readonly number[],
): MembershipGrant {
  return {
    orgRole: role,
    accessLevel: role === "admin" || unitIds.length > 0 ? "internal" : "member",
  };
}

/** 呼叫者：Platform Admin（users.role 'admin'）可進入所有組織的後台 */
export interface OrgAdminCaller {
  userId: number;
  isPlatformAdmin: boolean;
}

/** 已確認呼叫者能管理的組織；`id` 是內部 id，只在 server 用 */
export interface AdminOrg {
  id: number;
  publicId: string;
  name: string;
}

export interface OrgUnit {
  id: number;
  name: string;
}

export interface OrgMember {
  id: number;
  email: string;
  role: MemberRole;
  unitIds: number[];
}

export interface MemberIdentity {
  role: MemberRole;
  unitIds: number[];
}

export interface AddMemberInput extends MemberIdentity {
  email: string;
}

function uniqueSorted(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** 單位必須都屬於這個組織，否則是 client 送錯 id（INVALID_REQUEST） */
async function assertUnitsInOrg(
  db: Queryable,
  orgId: number,
  unitIds: number[],
): Promise<void> {
  if (unitIds.length === 0) return;
  //* IN (?) 需要 query() 展開陣列
  const [units] = await db.query<RowDataPacket[]>(
    "SELECT id FROM org_units WHERE org_id = ? AND id IN (?)",
    [orgId, unitIds],
  );
  if (units.length !== unitIds.length) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Unit does not belong to this organization",
    );
  }
}

async function insertUnitContacts(
  db: Queryable,
  orgId: number,
  membershipId: number,
  unitIds: number[],
): Promise<void> {
  if (unitIds.length === 0) return;
  await db.query(
    "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES ?",
    [unitIds.map((unitId) => [orgId, unitId, membershipId])],
  );
}

/**
 * 組織至少要留一位 Org Admin（ORG_LAST_ADMIN）。
 * 鎖住該組織的 Org Admin 列，避免兩位管理員同時互相移除／降級後組織沒人管。
 */
async function assertNotLastAdmin(db: Queryable, orgId: number): Promise<void> {
  const [admins] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM org_memberships WHERE org_id = ? AND org_role = 'admin' FOR UPDATE",
    [orgId],
  );
  if (admins.length <= 1) {
    throw new HttpError(
      409,
      "ORG_LAST_ADMIN",
      "An organization needs at least one Org Admin",
    );
  }
}

/** 鎖住要改的 membership；不在這個組織時回 404 ORG_MEMBER_NOT_FOUND */
async function lockMembership(
  db: Queryable,
  orgId: number,
  membershipId: number,
): Promise<{ orgRole: OrgRole; email: string; userId: number }> {
  const [targets] = await db.execute<RowDataPacket[]>(
    "SELECT m.org_role, m.user_id, u.email FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.id = ? FOR UPDATE",
    [orgId, membershipId],
  );
  if (targets.length === 0) {
    throw new HttpError(404, "ORG_MEMBER_NOT_FOUND", "Member not found");
  }
  return {
    orgRole: targets[0].org_role as OrgRole,
    email: targets[0].email,
    userId: Number(targets[0].user_id),
  };
}

export const orgMemberService = {
  /** 呼叫者能管理的組織：Org Admin 是自己擔任的，Platform Admin 是全部 */
  async listAdminOrgs(
    caller: OrgAdminCaller,
  ): Promise<{ id: string; name: string }[]> {
    const [rows] = caller.isPlatformAdmin
      ? await dbPool.execute<RowDataPacket[]>(
          "SELECT public_id, name FROM organizations ORDER BY name",
        )
      : await dbPool.execute<RowDataPacket[]>(
          "SELECT o.public_id, o.name FROM org_memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? AND m.org_role = 'admin' ORDER BY o.name",
          [caller.userId],
        );
    return rows.map((r) => ({ id: r.public_id, name: r.name }));
  },

  /**
   * 呼叫者不是該組織的 Org Admin（也不是 Platform Admin）時，和組織不存在一樣回 404 ORG_NOT_FOUND，
   * 不洩漏組織存在。
   */
  async requireAdminOrg(
    publicId: string,
    caller: OrgAdminCaller,
  ): Promise<AdminOrg> {
    const [rows] = caller.isPlatformAdmin
      ? await dbPool.execute<RowDataPacket[]>(
          "SELECT id, public_id, name FROM organizations WHERE public_id = ? LIMIT 1",
          [publicId],
        )
      : await dbPool.execute<RowDataPacket[]>(
          "SELECT o.id, o.public_id, o.name FROM organizations o JOIN org_memberships m ON m.org_id = o.id WHERE o.public_id = ? AND m.user_id = ? AND m.org_role = 'admin' LIMIT 1",
          [publicId, caller.userId],
        );
    if (rows.length === 0) throw orgNotFound();
    return {
      id: Number(rows[0].id),
      publicId: rows[0].public_id,
      name: rows[0].name,
    };
  },

  async listUnits(orgId: number): Promise<OrgUnit[]> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id, name FROM org_units WHERE org_id = ? ORDER BY id",
      [orgId],
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  },

  async listMembers(orgId: number): Promise<OrgMember[]> {
    const [memberRows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT m.id, m.org_role, u.email FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.id",
      [orgId],
    );
    const [contactRows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT membership_id, org_unit_id FROM org_unit_contacts WHERE org_id = ? ORDER BY org_unit_id",
      [orgId],
    );
    const unitsByMember = new Map<number, number[]>();
    for (const row of contactRows) {
      const memberId = Number(row.membership_id);
      unitsByMember.set(memberId, [
        ...(unitsByMember.get(memberId) ?? []),
        Number(row.org_unit_id),
      ]);
    }
    return memberRows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      role: r.org_role as MemberRole,
      unitIds: (unitsByMember.get(Number(r.id)) ?? []).sort((a, b) => a - b),
    }));
  },

  /** 同組織內單位名稱重複時，unique key 擋下（ER_DUP_ENTRY → DUPLICATE_ENTRY） */
  async createUnit(orgId: number, name: string): Promise<OrgUnit> {
    const [result] = await dbPool.execute<ResultSetHeader>(
      "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
      [orgId, name],
    );
    return { id: result.insertId, name };
  },

  /**
   * 以 email 加入已註冊帳號，同時指定 Org Admin／Org Member 與擔任窗口的單位。
   * membership 與單位窗口在同一個交易寫入。
   */
  async addMember(orgId: number, input: AddMemberInput): Promise<OrgMember> {
    const unitIds = uniqueSorted(input.unitIds);
    return withTransaction(async (connection) => {
      await assertUnitsInOrg(connection, orgId, unitIds);
      const { membershipId } = await addMembershipByEmail(
        connection,
        orgId,
        input.email,
        membershipGrant(input.role, unitIds),
      );
      await insertUnitContacts(connection, orgId, membershipId, unitIds);
      return {
        id: membershipId,
        email: input.email.trim(),
        role: input.role,
        unitIds,
      };
    });
  },

  /**
   * 改成員的身分：Org Admin／Org Member 與窗口單位整組取代，access_level 隨之重新推導。
   * 把最後一位 Org Admin 降級回 ORG_LAST_ADMIN。
   */
  async updateMember(
    orgId: number,
    membershipId: number,
    identity: MemberIdentity,
  ): Promise<OrgMember> {
    const unitIds = uniqueSorted(identity.unitIds);
    return withTransaction(async (connection) => {
      const target = await lockMembership(connection, orgId, membershipId);
      if (target.orgRole === "admin" && identity.role !== "admin") {
        await assertNotLastAdmin(connection, orgId);
      }
      await assertUnitsInOrg(connection, orgId, unitIds);
      const grant = membershipGrant(identity.role, unitIds);
      await connection.execute(
        "UPDATE org_memberships SET org_role = ?, access_level = ? WHERE org_id = ? AND id = ?",
        [grant.orgRole, grant.accessLevel, orgId, membershipId],
      );
      await connection.execute(
        "DELETE FROM org_unit_contacts WHERE org_id = ? AND membership_id = ?",
        [orgId, membershipId],
      );
      await insertUnitContacts(connection, orgId, membershipId, unitIds);
      return {
        id: membershipId,
        email: target.email,
        role: identity.role,
        unitIds,
      };
    });
  },

  /**
   * 移除成員身分。組織至少要留一位 Org Admin（ORG_LAST_ADMIN）。
   * 回傳同一交易裡自動婉拒的申請，由呼叫端在 commit 後通知
   */
  async removeMember(
    orgId: number,
    membershipId: number,
  ): Promise<DeclinedWeave[]> {
    return withTransaction(async (connection) => {
      const target = await lockMembership(connection, orgId, membershipId);
      if (target.orgRole === "admin") {
        await assertNotLastAdmin(connection, orgId);
      }
      await connection.execute(
        "DELETE FROM org_memberships WHERE org_id = ? AND id = ?",
        [orgId, membershipId],
      );
      return declineRequestsOfRemovedMember(connection, orgId, target.userId);
    });
  },
};
