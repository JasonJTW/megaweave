// server/src/services/postVisibility.ts
// 貼文可見性的唯一來源（ADR 0003）。所有讀取 posts 的 SQL 都從這裡取得可見性條件，
// 漏掉任何一處就會洩漏 Internal／Members 物品。
//
// - 個人貼文：org_id IS NULL，等同 Public（schema 以 CHECK 保證其 audience_tier = 'public'）。
// - 公開介面（首頁 Feed、搜尋、熱門排行、向量推薦、興趣學習）一律用 publicSurfaceCondition：
//   prototype 例外下，即使是組織成員也只在組織頁看到 Internal／Members 物品。
// - 依檢視者判斷的路徑（詳情、留言、按讚、Weave…）用 postVisibleIn(scope)，
//   scope 由檢視者的組織成員資格算出（scopeFromMemberships）。

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export const AUDIENCE_TIERS = ["internal", "members", "public"] as const;
export type AudienceTier = (typeof AUDIENCE_TIERS)[number];

/** org_memberships.access_level */
export const ACCESS_LEVELS = ["internal", "member"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export interface SqlFragment {
  sql: string;
  params: Array<string | number>;
}

/** 檢視者在某個組織看得到的層級（不含 Public，Public 對所有人可見） */
export interface OrgTierAccess {
  orgId: number;
  tiers: readonly AudienceTier[];
}

/** 檢視者的可見範圍；空的 orgs 代表只看得到 Public */
export interface ViewerScope {
  orgs: readonly OrgTierAccess[];
}

export const PUBLIC_SCOPE: ViewerScope = Object.freeze({ orgs: Object.freeze([]) });

const TIERS_BY_ACCESS_LEVEL: Record<AccessLevel, readonly AudienceTier[]> = {
  internal: ["internal", "members"],
  member: ["members"],
};

/** 由 org_memberships 列算出檢視者的可見範圍 */
export function scopeFromMemberships(
  memberships: ReadonlyArray<{ orgId: number; accessLevel: AccessLevel }>,
): ViewerScope {
  return {
    orgs: memberships.map(({ orgId, accessLevel }) => ({
      orgId,
      tiers: TIERS_BY_ACCESS_LEVEL[accessLevel],
    })),
  };
}

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function column(alias: string, name: string): string {
  // alias 會直接拼進 SQL，只接受識別字
  if (!SQL_ALIAS.test(alias)) throw new Error(`Invalid SQL table alias: ${alias}`);
  return `${alias}.${name}`;
}

/**
 * 公開介面的可見性條件：個人貼文或 Public 層的組織貼文。不需要參數，可直接拼進 WHERE。
 * @param alias posts 資料表在查詢中的別名
 */
export function publicSurfaceCondition(alias = "p"): string {
  return `(${column(alias, "org_id")} IS NULL OR ${column(alias, "audience_tier")} = 'public')`;
}

/**
 * 依檢視者範圍的可見性條件：Public，或檢視者所屬組織中其層級允許的貼文。
 * @param alias posts 資料表在查詢中的別名
 */
export function postVisibleIn(scope: ViewerScope, alias = "p"): SqlFragment {
  const orgId = column(alias, "org_id");
  const tier = column(alias, "audience_tier");
  const clauses = [`${orgId} IS NULL`, `${tier} = 'public'`];
  const params: Array<string | number> = [];
  for (const access of scope.orgs) {
    if (access.tiers.length === 0) continue;
    clauses.push(`(${orgId} = ? AND ${tier} IN (${access.tiers.map(() => "?").join(", ")}))`);
    params.push(access.orgId, ...access.tiers);
  }
  return { sql: `(${clauses.join(" OR ")})`, params };
}

/** 能執行查詢的 pool 或交易中的 connection */
export type SqlExecutor = Pick<Pool, "execute"> | Pick<PoolConnection, "execute">;

/**
 * 檢視者的成員資格；Platform Admin（users.role = 'admin'）在每個組織另有一列 Internal（ADR 0003，2026-11-09）。
 * 角色從 users 讀而不是 session：呼叫端傳入的不一定是登入者（私訊收件人、Weave 接收者）。
 */
export const VIEWER_MEMBERSHIPS_SQL =
  "SELECT org_id, access_level FROM org_memberships WHERE user_id = ? UNION ALL SELECT o.id AS org_id, 'internal' AS access_level FROM organizations o JOIN users u ON u.id = ? AND u.role = 'admin'";

/**
 * 從 org_memberships 載入檢視者的可見範圍。未登入（或沒有成員資格）只看得到 Public。
 * 單篇貼文的讀取路徑透過 viewerVisibility 呼叫這裡，再把條件拼進查貼文的 SQL，
 * 查不到就回 404（ADR 0003：不回 403，不洩漏物品存在）。
 */
export async function loadViewerScope(
  db: SqlExecutor,
  userId: number | null | undefined,
): Promise<ViewerScope> {
  if (!userId) return PUBLIC_SCOPE;
  const [rows] = await db.execute<RowDataPacket[]>(VIEWER_MEMBERSHIPS_SQL, [
    userId,
    userId,
  ]);
  if (rows.length === 0) return PUBLIC_SCOPE;
  //* Platform Admin 同時是某組織的 Org Member 時同一組織有兩列，取看得最多的 Internal
  const byOrg = new Map<number, AccessLevel>();
  for (const row of rows) {
    const orgId = Number(row.org_id);
    const level = row.access_level as AccessLevel;
    if (byOrg.get(orgId) !== "internal") byOrg.set(orgId, level);
  }
  return scopeFromMemberships(
    [...byOrg].map(([orgId, accessLevel]) => ({ orgId, accessLevel })),
  );
}

/**
 * 檢視者的可見性條件：loadViewerScope + postVisibleIn。依檢視者判斷的查詢都用這個。
 * @param alias posts 資料表在查詢中的別名
 */
export async function viewerVisibility(
  db: SqlExecutor,
  userId: number | null | undefined,
  alias = "p",
): Promise<SqlFragment> {
  return postVisibleIn(await loadViewerScope(db, userId), alias);
}

/**
 * 以數字 id 判斷檢視者能否看到某篇（未刪除的）貼文。供只拿到 post_id 的路徑
 * （留言、私訊附帶的貼文資訊）在讀寫前先擋下，看不到就回 404。
 */
export async function isPostVisibleTo(
  db: SqlExecutor,
  postId: number,
  userId: number | null | undefined,
): Promise<boolean> {
  const visibility = await viewerVisibility(db, userId);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM posts p WHERE p.id = ? AND p.deleted_at IS NULL AND ${visibility.sql}`,
    [postId, ...visibility.params],
  );
  return rows.length > 0;
}
