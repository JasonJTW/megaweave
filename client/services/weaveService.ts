// src/services/weaveService.ts
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
import { Post } from "../app/types/schema";
interface WeaveItemParam {
  itemId: number;
  quantity: number;
}

interface CreateWeaveParams {
  postId: number;
  items?: WeaveItemParam[];
  // 相容舊呼叫
  itemId?: number | null;
  quantity?: number;
  notes?: string;
}

export interface WeaveItem {
  id?: number;
  weave_id?: number;
  item_id: number | null;
  title?: string | null;
  quantity: number;
}

export interface Weave {
  id: number;
  post_id: number;
  post_title: string;
  items: WeaveItem[];
  // 相容保留舊欄位
  item_id?: number | null;
  item_title?: string;
  quantity?: number;
  status: "pending" | "completed" | "cancelled" | "rejected" | "requested";
  giver_confirmed: boolean;
  receiver_confirmed: boolean;
  notes?: string;
  giver_id: number;
  giver_name: string;
  giver_avatar: string;
  receiver_id: number;
  receiver_name: string;
  receiver_avatar: string;
  conversation_id?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  post: Post;
}

export const createWeave = async ({
  postId,
  items,
  itemId,
  quantity,
  notes,
}: CreateWeaveParams) => {
  try {
    // 如果傳入單個 itemId/quantity，轉換為 items 陣列傳給後端
    const requestItems =
      items && items.length > 0
        ? items
        : itemId
          ? [{ itemId, quantity: quantity || 1 }]
          : [];

    const response = await fetch(`${hostName}/api/weaves`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        postId,
        items: requestItems,
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
