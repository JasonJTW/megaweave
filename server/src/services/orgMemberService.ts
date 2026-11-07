//* 組織管理員後台：單位與成員（PRD 0001 §5.1、ADR 0003）
//* 後台的三種身分對應到 `org_memberships` 的兩個欄位：
//*   Org Admin    → org_role 'admin'，access_level 'internal'
//*   Unit Contact → org_role 'staff'，access_level 'internal'，並在 org_unit_contacts 掛一或多個單位
//*   Org Member   → org_role 'member'，access_level 'member'
//* 移除成員只刪 membership 本身（org_unit_contacts 由外鍵連帶刪除）；進行中 Weave 的處理在交接 ticket
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { withTransaction } from "../utils/transaction";
import {
  addMembershipByEmail,
  MembershipGrant,
  orgNotFound,
  OrgRole,
} from "./orgService";

export const MEMBER_ROLES = ["admin", "unit_contact", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const ROLE_COLUMNS: Record<MemberRole, MembershipGrant> = {
  admin: { orgRole: "admin", accessLevel: "internal" },
  unit_contact: { orgRole: "staff", accessLevel: "internal" },
  member: { orgRole: "member", accessLevel: "member" },
};

const ROLE_BY_ORG_ROLE: Record<OrgRole, MemberRole> = {
  admin: "admin",
  staff: "unit_contact",
  member: "member",
};

/** 已確認呼叫者是 Org Admin 的組織；`id` 是內部 id，只在 server 用 */
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

export interface AddMemberInput {
  email: string;
  role: MemberRole;
  unitIds: number[];
}

export const orgMemberService = {
  /** 呼叫者擔任 Org Admin 的組織 */
  async listAdminOrgs(userId: number): Promise<{ id: string; name: string }[]> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT o.public_id, o.name FROM org_memberships m JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ? AND m.org_role = 'admin' ORDER BY o.name",
      [userId],
    );
    return rows.map((r) => ({ id: r.public_id, name: r.name }));
  },

  /**
   * 呼叫者不是該組織的 Org Admin 時，和組織不存在一樣回 404 ORG_NOT_FOUND，不洩漏組織存在。
   * Platform Admin 也一樣：開通組織之外的管理要先被加為 Org Admin。
   */
  async requireAdminOrg(publicId: string, userId: number): Promise<AdminOrg> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT o.id, o.public_id, o.name FROM organizations o JOIN org_memberships m ON m.org_id = o.id WHERE o.public_id = ? AND m.user_id = ? AND m.org_role = 'admin' LIMIT 1",
      [publicId, userId],
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
      role: ROLE_BY_ORG_ROLE[r.org_role as OrgRole],
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
   * 以 email 加入已註冊帳號。Unit Contact 的單位必須都屬於這個組織，否則是 client 送錯 id（INVALID_REQUEST）。
   * membership 與單位窗口在同一個交易寫入。
   */
  async addMember(orgId: number, input: AddMemberInput): Promise<OrgMember> {
    const unitIds = [...new Set(input.unitIds)];
    return withTransaction(async (connection) => {
      if (unitIds.length > 0) {
        //* IN (?) 需要 query() 展開陣列
        const [units] = await connection.query<RowDataPacket[]>(
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
      const { membershipId } = await addMembershipByEmail(
        connection,
        orgId,
        input.email,
        ROLE_COLUMNS[input.role],
      );
      if (unitIds.length > 0) {
        await connection.query(
          "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES ?",
          [unitIds.map((unitId) => [orgId, unitId, membershipId])],
        );
      }
      return {
        id: membershipId,
        email: input.email.trim(),
        role: input.role,
        unitIds: [...unitIds].sort((a, b) => a - b),
      };
    });
  },

  /**
   * 移除成員身分。組織至少要留一位 Org Admin（ORG_LAST_ADMIN）；
   * 鎖住該組織的 Org Admin 列，避免兩位管理員同時互相移除後組織沒人管。
   */
  async removeMember(orgId: number, membershipId: number): Promise<void> {
    await withTransaction(async (connection) => {
      const [targets] = await connection.execute<RowDataPacket[]>(
        "SELECT org_role FROM org_memberships WHERE org_id = ? AND id = ? FOR UPDATE",
        [orgId, membershipId],
      );
      if (targets.length === 0) {
        throw new HttpError(404, "ORG_MEMBER_NOT_FOUND", "Member not found");
      }
      if (targets[0].org_role === "admin") {
        const [admins] = await connection.execute<RowDataPacket[]>(
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
      await connection.execute(
        "DELETE FROM org_memberships WHERE org_id = ? AND id = ?",
        [orgId, membershipId],
      );
    });
  },
};
