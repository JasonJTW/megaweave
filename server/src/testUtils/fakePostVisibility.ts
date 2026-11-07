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
