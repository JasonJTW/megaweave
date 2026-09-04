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
        const qty = Math.max(1, it.quantity ?? 1);
        return {
          id: it.id,
          itemId: it.id,
          title: it.title,
          quantity: qty,
          quantityLeft: qty,
          selected: true,
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
      const isTarget = it.id === targetId;
      const left = Math.max(1, it.quantity ?? 1);
      return {
        id: it.id,
        itemId: it.id,
        title: it.title,
        quantity: isTarget ? 1 : left,
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
  if (items.length === 0) return false;
  return items.every((it) => it.selected && it.quantity === it.quantityLeft);
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
    if (it.id !== itemId) return it;
    const nextSelected = !it.selected;
    return {
      ...it,
      selected: nextSelected,
      // 重新勾選時，重設為最大可用量
      quantity: nextSelected ? it.quantityLeft : it.quantity,
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
    if (it.id !== itemId) return it;
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
 * - all_items: 完整映射所有真實 sub-items (已選取且為全量)
 * - custom: 映射使用者自選的真實 sub-items
 */
export function getWeaveSubmitPayload(
  draft: WeaveDraft,
): SelectedWeaveItem[] {
  if (draft.mode === "all_post") {
    return [{ itemId: null, quantity: 1, title: draft.postTitle }];
  }

  const selected = draft.items.filter((it) => it.selected);
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

  const count = draft.items.filter((it) => it.selected).length;
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

  const selected = draft.items.filter((it) => it.selected);
  if (selected.length === 1) {
    return { isAll: false, displayTitle: selected[0].title };
  }

  if (selected.length > 1) {
    return { isAll: false, displayTitle: `${selected.length} items` };
  }

  return { isAll: true };
}
