//* 組織物品的聯絡代號（#140、ADR 0004）：server 以 `org-post:<貼文>`、`org-conv:<對話>` 取代窗口的 users.public_id，
//* 私訊時照常當收件人傳回去；但它不是個人帳號，不能開個人頁或載入個人資料
export function isOrgContactId(publicId: string | null | undefined): boolean {
  return typeof publicId === "string" && publicId.startsWith("org-");
}

/** 可以開個人頁的 public_id；組織代號回 null */
export function profilePublicId(
  publicId: string | null | undefined,
): string | null {
  return publicId && !isOrgContactId(publicId) ? publicId : null;
}

/**
 * 組織設定「匿名」時，server 給的發文者名稱是這個代號（server/src/services/orgPublisher.ts 的
 * ANONYMOUS_PUBLISHER_NAME），由 client 依讀者語言顯示
 */
export const ANONYMOUS_PUBLISHER = "org-anonymous";

/** 顯示用的名稱：匿名代號換成 `anonymousLabel`，其他照原樣 */
export function publisherDisplayName<T extends string | null | undefined>(
  name: T,
  anonymousLabel: string,
): T | string {
  return name === ANONYMOUS_PUBLISHER ? anonymousLabel : name;
}

/** 公開層的發文者顯示方式（organizations.publisher_display） */
export const PUBLISHER_DISPLAYS = ["org", "org_unit", "anonymous"] as const;
export type PublisherDisplay = (typeof PUBLISHER_DISPLAYS)[number];
