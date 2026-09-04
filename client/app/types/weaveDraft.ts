import { Post } from "./schema";

export interface SelectedWeaveItem {
  itemId: number | null;
  quantity: number;
  title: string;
}

export interface WeaveDraftItem {
  id: number;
  itemId: number;
  title: string;
  quantity: number;
  quantityLeft: number;
  selected: boolean;
}

export type WeaveDraftMode = "all_post" | "all_items" | "custom";

export interface WeaveDraft {
  mode: WeaveDraftMode;
  postId: number;
  postTitle: string;
  items: WeaveDraftItem[];
}

/**
 * 根據 Post 與進入聊天時的初始 item 建立初始 WeaveDraft
 */
export function createInitialDraft(
  post: Post,
  initialItem?: { id?: string | number; title?: string } | null,
): WeaveDraft {
  const postItems = post.items || [];
  const isAll =
    !initialItem ||
    initialItem.id === undefined ||
    String(initialItem.id).toLowerCase() === "all";

  // Case 1: 貼文本身無任何 sub-items
  if (postItems.length === 0) {
    return {
      mode: "all_post",
      postId: post.id,
      postTitle: post.title,
      items: [],
    };
  }

  // Case 2: 貼文有 sub-items 且使用者選擇了 All
  if (isAll) {
    return {
      mode: "all_items",
      postId: post.id,
      postTitle: post.title,
      items: postItems.map((it) => {
        const left = it.quantity ?? 0;
        const hasStock = left > 0;
        return {
          id: it.id,
          itemId: it.id,
          title: it.title,
          quantity: hasStock ? left : 0,
          quantityLeft: left,
          selected: hasStock,
        };
      }),
    };
  }

  // Case 3: 針對特定單一 sub-item 發起
  const targetId = Number(initialItem.id);
  return {
    mode: "custom",
    postId: post.id,
    postTitle: post.title,
    items: postItems.map((it) => {
      const left = it.quantity ?? 0;
      const isTarget = it.id === targetId && left > 0;
      return {
        id: it.id,
        itemId: it.id,
        title: it.title,
        quantity: isTarget ? 1 : 0,
        quantityLeft: left,
        selected: isTarget,
      };
    }),
  };
}

/**
 * 檢查當前選取狀態是否符合「全品項選滿（all_items）」
 */
export function isAllItemsSelected(items: WeaveDraftItem[]): boolean {
  const availableItems = items.filter((it) => it.quantityLeft > 0);
  if (availableItems.length === 0) return false;
  return availableItems.every((it) => it.selected && it.quantity === it.quantityLeft);
}

/**
 * 切換某個 sub-item 的勾選狀態
 */
export function toggleDraftItem(
  draft: WeaveDraft,
  itemId: number,
): WeaveDraft {
  if (draft.mode === "all_post") return draft;

  const nextItems = draft.items.map((it) => {
    if (it.id !== itemId || it.quantityLeft <= 0) return it;
    const nextSelected = !it.selected;
    return {
      ...it,
      selected: nextSelected,
      // 重新勾選時，重設為最大可用庫存量
      quantity: nextSelected ? it.quantityLeft : 0,
    };
  });

  const allSelected = isAllItemsSelected(nextItems);
  return {
    ...draft,
    mode: allSelected ? "all_items" : "custom",
    items: nextItems,
  };
}

/**
 * 更新某個 sub-item 的選取數量
 */
export function updateDraftItemQuantity(
  draft: WeaveDraft,
  itemId: number,
  quantity: number,
): WeaveDraft {
  if (draft.mode === "all_post") return draft;

  const nextItems = draft.items.map((it) => {
    if (it.id !== itemId || it.quantityLeft <= 0) return it;
    const clampedQty = Math.max(1, Math.min(it.quantityLeft, quantity));
    return {
      ...it,
      quantity: clampedQty,
      selected: true, // 調整數量時確保已勾選
    };
  });

  const allSelected = isAllItemsSelected(nextItems);
  return {
    ...draft,
    mode: allSelected ? "all_items" : "custom",
    items: nextItems,
  };
}

/**
 * 匯出給 API (createWeave) 的 payload
 * - all_post: 送出 itemId: null 代表整篇貼文
 * - all_items: 完整映射所有真實 sub-items (已選取且有數量)
 * - custom: 映射使用者自選的真實 sub-items
 */
export function getWeaveSubmitPayload(
  draft: WeaveDraft,
): SelectedWeaveItem[] {
  if (draft.mode === "all_post") {
    return [{ itemId: null, quantity: 1, title: draft.postTitle }];
  }

  const selected = draft.items.filter((it) => it.selected && it.quantity > 0);
  if (selected.length === 0) {
    return [{ itemId: null, quantity: 1, title: draft.postTitle }];
  }

  return selected.map((it) => ({
    itemId: it.id,
    quantity: it.quantity,
    title: it.title,
  }));
}

/**
 * 取得選取狀態文字
 */
export function getDraftSelectedLabel(draft: WeaveDraft): string {
  if (draft.mode === "all_post" || draft.mode === "all_items") {
    return "Selected: All";
  }

  const count = draft.items.filter((it) => it.selected && it.quantity > 0).length;
  const suffix = count === 1 ? "item" : "items";
  return `Selected: ${count} ${suffix}`;
}

/**
 * 取得 ChatWindow 橫幅所需的資訊
 */
export function getDraftBannerInfo(draft: WeaveDraft | null): {
  isAll: boolean;
  displayTitle?: string;
} {
  if (!draft) return { isAll: true };

  if (draft.mode === "all_post" || draft.mode === "all_items") {
    return { isAll: true };
  }

  const selected = draft.items.filter((it) => it.selected && it.quantity > 0);
  if (selected.length === 1) {
    return { isAll: false, displayTitle: selected[0].title };
  }

  if (selected.length > 1) {
    return { isAll: false, displayTitle: `${selected.length} items` };
  }

  return { isAll: true };
}

/**
 * 從 WeaveDraft 推導出後端 /api/messages 所需的 item_id 和 item_title。
 * 回傳 null 表示不需要附帶 weaving intent（無 draft）。
 */
export function getDraftSendPayload(
  draft: WeaveDraft | null,
): { item_id: string; item_title: string } | null {
  if (!draft) return null;

  if (draft.mode === "all_post" || draft.mode === "all_items") {
    return { item_id: "all", item_title: draft.postTitle };
  }

  // custom mode
  const selected = draft.items.filter((it) => it.selected && it.quantity > 0);
  if (selected.length === 0) return null;

  if (selected.length === 1) {
    return {
      item_id: String(selected[0].itemId),
      item_title: selected[0].title,
    };
  }

  // 多選：統一送 "all"，後端以 post_id 為準
  return { item_id: "all", item_title: draft.postTitle };
}
