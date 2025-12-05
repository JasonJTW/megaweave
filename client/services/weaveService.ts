// src/services/weaveService.ts

interface CreateWeaveParams {
  postId: number;
  itemId: number | null;
  quantity: number;
  notes?: string;
}
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export const createWeave = async ({
  postId,
  itemId,
  quantity,
  notes,
}: CreateWeaveParams) => {
  try {
    const response = await fetch(`${hostName}/api/weaves`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      // 如果你的 Auth 依賴 Cookie (httpOnly)，通常不需要額外設定，瀏覽器會自動帶入
      // 如果你的 Auth 需要特定的 Header (如 Authorization: Bearer token)，請在這裡加上
      body: JSON.stringify({
        postId,
        itemId, // 對應 weaves.ts: itemId (可以是 number 或 null)
        quantity, // 對應 weaves.ts: quantity (必須是 number)
        notes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // 捕捉後端回傳的錯誤訊息 (例如: "Cannot weave your own post" 或 "Insufficient stock")
      throw new Error(data.errorMessage || "Failed to send weave request");
    }

    return data;
  } catch (error) {
    throw error;
  }
};
