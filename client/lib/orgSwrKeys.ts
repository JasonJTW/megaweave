//* 組織物品清單的 SWR key（#136）。上架後要讓這些 key 重新抓：導回組織頁時若還在
//* SWR 的 dedupe 區間內（預設 2 秒，production build 夠快就會碰到），會直接顯示舊快取而看不到新物品。

/** 組織頁（`/org`）的物品清單 */
export function orgPostsKey(host: string | undefined, orgId: string): string {
  return `${host}/api/orgs/${orgId}/posts`;
}

/** 物品管理（`/org/items`）的清單，`qs` 是篩選條件（可為空字串） */
export function orgItemsKey(
  host: string | undefined,
  orgId: string,
  qs: string,
): string {
  return `${host}/api/orgs/${orgId}/items${qs ? `?${qs}` : ""}`;
}

/** 給 SWR `mutate(matcher)`：符合該組織任一物品清單（含所有篩選組合）的 key */
export function isOrgListingKey(host: string | undefined, orgId: string) {
  const posts = orgPostsKey(host, orgId);
  const items = orgItemsKey(host, orgId, "");
  return (key: unknown): boolean =>
    typeof key === "string" &&
    (key === posts || key === items || key.startsWith(`${items}?`));
}
