//* Weave（CONTEXT.md「交換」）在 client 的唯一入口：型別、下命令、建立請求、哪些 SWR key 要跟著更新。
//* 誰能做什麼由 server 的轉移表決定，透過 `weave.viewer` 回傳；client 不自己推導角色
//* 例外：還沒有 Weave 紀錄的草稿只能從 Post 類型推導（draftRole）
import type { ScopedMutator } from "swr";
import type { Post } from "@/app/types/schema";
import { api, type ApiPath } from "@/lib/api";

export type WeaveStatus =
  | "requested"
  | "approved"
  | "completed"
  | "declined"
  | "cancelled"
  | "withdrawn";

/** server/src/services/weave/transitions.ts 的命令 */
export type WeaveCommand =
  "approve" | "decline" | "withdraw" | "cancel" | "confirm";

/** 物品流向（ADR 0001） */
export type WeaveRole = "giver" | "receiver";

/** 看的人在這筆 Weave 的身分與現在能下的命令（GET /api/weaves、/api/me 附上） */
export interface WeaveViewer {
  role: WeaveRole | null;
  isInitiator: boolean;
  isReviewer: boolean;
  commands: WeaveCommand[];
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
  status: WeaveStatus;
  giver_confirmed: boolean;
  receiver_confirmed: boolean;
  notes?: string;
  giver_id: number;
  giver_name: string;
  giver_avatar: string;
  receiver_id: number;
  receiver_name: string;
  receiver_avatar: string;
  /** 物品流向的單位（ADR 0004）；個人 Weave 為 null */
  receiver_org_unit?: { id: number; name: string } | null;
  conversation_id?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  post: Post;
  viewer?: WeaveViewer;
}

export function weaveKey(weaveId: number | string): ApiPath {
  return `/api/weaves/${weaveId}`;
}

/** SWR `mutate(matcher)`：依賴 Weave 的畫面——單筆、我的頁面（/api/me）、Weave 清單（含篩選） */
export function isWeaveDependentKey(weaveId: number | string) {
  const single = weaveKey(weaveId);
  return (key: unknown): boolean =>
    typeof key === "string" &&
    (key === single ||
      key === "/api/me" ||
      key === "/api/weaves" ||
      key.startsWith("/api/weaves?"));
}

/** Weave 建立或改變後（自己的操作或 socket 推播）讓所有依賴的畫面重抓 */
export function invalidateWeave(
  mutate: ScopedMutator,
  weaveId: number | string,
): Promise<unknown> {
  return mutate(isWeaveDependentKey(weaveId));
}

/** PATCH 收目標狀態（API 契約），這裡把命令對回去 */
const TARGET_STATUS: Record<WeaveCommand, WeaveStatus> = {
  approve: "approved",
  decline: "declined",
  withdraw: "withdrawn",
  cancel: "cancelled",
  confirm: "completed",
};

export interface WeaveCommandResult {
  /** 單方確認時仍是 approved */
  newStatus: WeaveStatus;
  fullyCompleted: boolean;
}

export function sendWeaveCommand(
  weaveId: number,
  command: WeaveCommand,
): Promise<WeaveCommandResult> {
  return api<WeaveCommandResult>(`/api/weaves/${weaveId}/status`, {
    method: "PATCH",
    body: { status: TARGET_STATUS[command] },
  });
}

export interface RequestWeaveParams {
  postId: number;
  items: Array<{ itemId: number | null; quantity: number }>;
  notes?: string;
  /**
   * 組織物品：代表的單位 id，或 null（我個人）。只有 GET /api/weaves/acting-units 回傳單位時才送；
   * 有選項卻省略，server 會回 INVALID_REQUEST（ADR 0004）
   */
  actingUnitId?: number | null;
}

/** 錯誤碼（例如 WEAVE_OWN_POST、INSUFFICIENT_STOCK）以 ApiError 丟出，交給 UI 翻譯 */
export function requestWeave({
  postId,
  items,
  notes,
  actingUnitId,
}: RequestWeaveParams): Promise<{ weaveId: number }> {
  return api("/api/weaves", {
    method: "POST",
    body: {
      postId,
      items,
      notes,
      ...(actingUnitId !== undefined && { actingUnitId }),
    },
  });
}

/**
 * 還沒有 Weave 紀錄時（請求草稿、剛送出還沒載入）的物品流向：Share 與 Commons 的 Post Author 是 Giver，
 * Wish 反過來（ADR 0001）。有紀錄之後一律看 `weave.viewer.role`
 */
export function draftRole(postType: string, isPostAuthor: boolean): WeaveRole {
  const authorGives = postType === "share" || postType === "commons";
  return authorGives === isPostAuthor ? "giver" : "receiver";
}
