//* 組織與成員資格（ADR 0003、PRD 0001 §5.1）
//* 帳號全站唯一，組織身分是掛在帳號上的 membership；`access_level` 管看得到什麼，`org_role` 管能管什麼
//* Prototype：成員以登入 email 對應已註冊帳號（不寄組織 email 驗證信），未註冊回 EMAIL_NOT_REGISTERED
import { randomUUID } from "crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";

export const PUBLISHER_DISPLAYS = ["org", "org_unit", "anonymous"] as const;
export type PublisherDisplay = (typeof PUBLISHER_DISPLAYS)[number];

export const ORG_ROLES = ["admin", "staff", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ACCESS_LEVELS = ["internal", "member"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export interface OrgSettings {
  name: string;
  publisherDisplay: PublisherDisplay;
  isDemo: boolean;
  autoReleaseEnabled: boolean;
  autoReleaseDays: number;
}

export interface CreateOrgInput extends OrgSettings {
  orgAdminEmail: string;
}

export interface OrgSummary extends OrgSettings {
  id: string;
  orgAdmins: { email: string }[];
}

type Queryable = Pick<PoolConnection, "query" | "execute">;

interface OrgRow extends RowDataPacket {
  id: number;
  public_id: string;
  name: string;
  publisher_display: PublisherDisplay;
  is_demo: boolean | number;
  auto_release_enabled: boolean | number;
  auto_release_days: number;
}

const ORG_SELECT =
  "SELECT id, public_id, name, publisher_display, is_demo, auto_release_enabled, auto_release_days FROM organizations";

//* API 欄位名 → DB 欄位名；PATCH 只會寫入這份白名單裡的欄位
const SETTING_COLUMNS: Record<keyof OrgSettings, string> = {
  name: "name",
  publisherDisplay: "publisher_display",
  isDemo: "is_demo",
  autoReleaseEnabled: "auto_release_enabled",
  autoReleaseDays: "auto_release_days",
};

/** 依登入 email 找已註冊帳號；`users.email` 的 collation 不分大小寫 */
export async function findUserIdByEmail(
  db: Queryable,
  email: string,
): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email.trim()],
  );
  return rows.length > 0 ? Number(rows[0].id) : null;
}

/**
 * 以 email 把已註冊帳號加入組織。未註冊回 400 EMAIL_NOT_REGISTERED；
 * 已是成員時 MySQL 的 unique key 擋下（ER_DUP_ENTRY → DUPLICATE_ENTRY）。
 * 在呼叫端的交易裡執行，失敗時由呼叫端 rollback。
 */
export async function addMembershipByEmail(
  db: Queryable,
  orgId: number,
  email: string,
  role: { orgRole: OrgRole; accessLevel: AccessLevel },
): Promise<{ membershipId: number; userId: number }> {
  const userId = await findUserIdByEmail(db, email);
  if (userId === null) {
    throw new HttpError(
      400,
      "EMAIL_NOT_REGISTERED",
      "No registered account uses this email",
    );
  }
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO org_memberships (org_id, user_id, access_level, org_role) VALUES (?, ?, ?, ?)",
    [orgId, userId, role.accessLevel, role.orgRole],
  );
  return { membershipId: result.insertId, userId };
}

async function loadOrgAdmins(
  db: Queryable,
  orgIds: number[],
): Promise<Map<number, { email: string }[]>> {
  const byOrg = new Map<number, { email: string }[]>();
  if (orgIds.length === 0) return byOrg;
  //* IN (?) 需要 query() 展開陣列；execute() 的 prepared statement 不支援
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT m.org_id, u.email FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_role = 'admin' AND m.org_id IN (?) ORDER BY m.id",
    [orgIds],
  );
  for (const row of rows) {
    const orgId = Number(row.org_id);
    byOrg.set(orgId, [...(byOrg.get(orgId) ?? []), { email: row.email }]);
  }
  return byOrg;
}

function toSummary(row: OrgRow, orgAdmins: { email: string }[]): OrgSummary {
  return {
    id: row.public_id,
    name: row.name,
    publisherDisplay: row.publisher_display,
    isDemo: Boolean(row.is_demo),
    autoReleaseEnabled: Boolean(row.auto_release_enabled),
    autoReleaseDays: Number(row.auto_release_days),
    orgAdmins,
  };
}

async function getOrganizationWith(
  db: Queryable,
  publicId: string,
): Promise<OrgSummary | null> {
  const [rows] = await db.execute<OrgRow[]>(
    `${ORG_SELECT} WHERE public_id = ?`,
    [publicId],
  );
  if (rows.length === 0) return null;
  const admins = await loadOrgAdmins(db, [rows[0].id]);
  return toSummary(rows[0], admins.get(rows[0].id) ?? []);
}

export const orgService = {
  async listOrganizations(): Promise<OrgSummary[]> {
    const [rows] = await dbPool.execute<OrgRow[]>(
      `${ORG_SELECT} ORDER BY created_at DESC, id DESC`,
    );
    const admins = await loadOrgAdmins(
      dbPool,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toSummary(r, admins.get(r.id) ?? []));
  },

  getOrganization(publicId: string): Promise<OrgSummary | null> {
    return getOrganizationWith(dbPool, publicId);
  },

  /** 建立組織並指定第一位 Org Admin（可看 Internal 層）；email 未註冊時整筆不寫入 */
  async createOrganization(input: CreateOrgInput): Promise<OrgSummary> {
    const publicId = randomUUID();
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO organizations (public_id, name, publisher_display, is_demo, auto_release_enabled, auto_release_days) VALUES (?, ?, ?, ?, ?, ?)",
        [
          publicId,
          input.name,
          input.publisherDisplay,
          input.isDemo,
          input.autoReleaseEnabled,
          input.autoReleaseDays,
        ],
      );
      await addMembershipByEmail(
        connection,
        result.insertId,
        input.orgAdminEmail,
        {
          orgRole: "admin",
          accessLevel: "internal",
        },
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    const org = await getOrganizationWith(dbPool, publicId);
    if (!org) throw new Error(`Organization ${publicId} vanished after create`);
    return org;
  },

  /** 只更新有傳入的設定；組織不存在回 null */
  async updateOrganization(
    publicId: string,
    patch: Partial<OrgSettings>,
  ): Promise<OrgSummary | null> {
    const entries = (Object.keys(SETTING_COLUMNS) as (keyof OrgSettings)[])
      .filter((key) => patch[key] !== undefined)
      .map((key) => [SETTING_COLUMNS[key], patch[key]] as const);

    if (entries.length > 0) {
      //* 欄位名來自 SETTING_COLUMNS 白名單，值一律走參數
      await dbPool.execute(
        `UPDATE organizations SET ${entries.map(([column]) => `${column} = ?`).join(", ")} WHERE public_id = ?`,
        [
          ...entries.map(([, value]) => value as string | number | boolean),
          publicId,
        ],
      );
    }
    return getOrganizationWith(dbPool, publicId);
  },
};
