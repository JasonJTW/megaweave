// 給 in-memory fake DB 用：依 postVisibleIn(scope) 綁定的參數判斷貼文是否可見。
// postVisibleIn 的參數依序是每個組織的 [orgId, ...tiers]，所以數字開頭一組。

export interface FakeOrgPost {
  org_id?: number | null;
  audience_tier?: string;
}

export function fakePostVisible(post: FakeOrgPost, visibilityParams: unknown[]): boolean {
  if (post.org_id == null || (post.audience_tier ?? "public") === "public") return true;
  let orgId: number | null = null;
  for (const param of visibilityParams) {
    if (typeof param === "number") orgId = param;
    else if (orgId === post.org_id && param === post.audience_tier) return true;
  }
  return false;
}

export type FakeMembership = { org_id: number; access_level: "internal" | "member" };

export const MEMBERSHIP_SQL = "SELECT org_id, access_level FROM org_memberships WHERE user_id = ?";

// 公開介面（publicSurfaceCondition）在 fake 裡的對應：只有 SQL 真的帶了條件才過濾，
// 漏掉條件的查詢會把 Internal／Members 貼文原樣回傳，測試因而失敗。
const PUBLIC_SURFACE_SQL = "(p.org_id IS NULL OR p.audience_tier = 'public')";

export function fakeOnPublicSurface(sql: string, post: FakeOrgPost): boolean {
  if (!sql.includes(PUBLIC_SURFACE_SQL)) return true;
  return post.org_id == null || (post.audience_tier ?? "public") === "public";
}

export const FAKE_ORG_ID = 7;

/** 同一位作者在四種可見性下各一篇貼文 */
export const POSTS_BY_TIER = [
  { id: 1, title: "personal", org_id: null, audience_tier: "public" },
  { id: 2, title: "org-public", org_id: FAKE_ORG_ID, audience_tier: "public" },
  { id: 3, title: "org-members", org_id: FAKE_ORG_ID, audience_tier: "members" },
  { id: 4, title: "org-internal", org_id: FAKE_ORG_ID, audience_tier: "internal" },
] as const;

/** postVisibleIn(scope, "p") 在 fake 裡的對應：SQL 沒帶可見性條件就不過濾 */
export function fakeVisibleToViewer(
  sql: string,
  post: FakeOrgPost,
  visibilityParams: unknown[],
): boolean {
  if (!sql.includes("(p.org_id IS NULL OR p.audience_tier = 'public'")) return true;
  return fakePostVisible(post, visibilityParams);
}
