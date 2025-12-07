// src/services/weaveService.ts
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
import { Post } from "../app/types/schema";
interface CreateWeaveParams {
  postId: number;
  itemId: number | null;
  quantity: number;
  notes?: string;
}

export interface Weave {
  id: number;
  post_id: number;
  post_title: string;
  item_title?: string;
  thumbnail_urls: string[];
  status: "pending" | "completed" | "cancelled";
  notes?: string;
  giver_id: number;
  giver_name: string;
  giver_avatar: string;
  receiver_id: number;
  receiver_name: string;
  receiver_avatar: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  post: Post & { thumbnail_urls: string[] };
}

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
