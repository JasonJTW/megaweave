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
