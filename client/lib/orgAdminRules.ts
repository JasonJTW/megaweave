//* 組織入口與管理員增減的判斷（ADR 0003：Platform Admin 在每個組織都等同 Org Admin）
//* 純函式，Navbar、/org-admin、/admin/orgs 共用，也方便單元測試

/** Navbar 的組織入口：能管組織 → 組織後台；只是成員 → 組織頁；還沒有組織的 Platform Admin → 開通組織 */
export function orgNavHref({
  isOrgAdmin,
  isMember,
  isPlatformAdmin,
}: {
  isOrgAdmin: boolean;
  isMember: boolean;
  isPlatformAdmin: boolean;
}): "/org-admin" | "/org" | "/admin/orgs" | null {
  if (isOrgAdmin) return "/org-admin";
  if (isMember) return "/org";
  if (isPlatformAdmin) return "/admin/orgs";
  return null;
}

/** 要管理的組織：網址 `?org=` 指定的那個；沒帶或不在清單裡（無權限、已刪除）就是第一個 */
export function pickOrg<T extends { id: string }>(
  orgs: readonly T[],
  wanted: string | null,
): T | null {
  return orgs.find((org) => org.id === wanted) ?? orgs[0] ?? null;
}

export interface OrgMemberIdentity {
  id: number;
  email: string;
  role: "admin" | "member";
  unitIds: number[];
}

/** 對 `/api/org-admin/orgs/:orgId` 底下送出的請求 */
export interface MemberRequest {
  method: "POST" | "PATCH";
  path: string;
  body: { email?: string; role: "admin" | "member"; unitIds: number[] };
}

/**
 * 以 Email 加入 Org Admin：已是成員（email 不分大小寫，與 users.email 的 collation 相同）→ PATCH 改成 admin，
 * 保留窗口單位；否則 POST 以 Org Admin 身分加入、沒有窗口單位
 */
export function addAdminRequest(
  members: readonly OrgMemberIdentity[],
  email: string,
): MemberRequest {
  const typed = email.trim();
  const existing = members.find(
    (m) => m.email.toLowerCase() === typed.toLowerCase(),
  );
  if (existing) {
    return {
      method: "PATCH",
      path: `/members/${existing.id}`,
      body: { role: "admin", unitIds: existing.unitIds },
    };
  }
  return {
    method: "POST",
    path: "/members",
    body: { email: typed, role: "admin", unitIds: [] },
  };
}

/** 移除 Org Admin：降為 Org Member，保留成員身分與窗口單位（最後一位由 server 擋下） */
export function demoteAdminRequest(member: OrgMemberIdentity): MemberRequest {
  return {
    method: "PATCH",
    path: `/members/${member.id}`,
    body: { role: "member", unitIds: member.unitIds },
  };
}
