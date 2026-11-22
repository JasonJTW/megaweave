//* Weave 狀態機（CONTEXT.md「Weave 狀態」）：（目前狀態 × 命令 × 動作者的角色）→ 下一個狀態。
//* 只有這裡決定誰能把 Weave 推到哪裡；寫入、庫存與通知由 lifecycle 照這張表做
import { WeaveError, type WeaveStatus } from "./types";

export const WEAVE_COMMANDS = ["approve", "decline", "withdraw", "cancel", "confirm"] as const;
export type WeaveCommand = (typeof WEAVE_COMMANDS)[number];

/**
 * 動作者在這筆 Weave 的身分。Giver／Receiver 是物品流向，Initiator 是先開口的一方，
 * Reviewer 是有權審核這次請求的人（個人 Post 是 Post Author，組織 Post 見 ADR 0003）
 */
export interface WeaveActorRoles {
  isGiver: boolean;
  isReceiver: boolean;
  isInitiator: boolean;
  isReviewer: boolean;
}

type RequiredRole = "reviewer" | "initiator" | "party";

export interface WeaveTransition {
  from: WeaveStatus;
  command: WeaveCommand;
  by: RequiredRole;
  /** confirm 是單方確認：雙方都確認後才到 completed，之前維持 approved */
  to: WeaveStatus;
  inventory: "reserve" | "release" | "deduct" | null;
}

export const WEAVE_TRANSITIONS: readonly WeaveTransition[] = [
  { from: "requested", command: "approve", by: "reviewer", to: "approved", inventory: "reserve" },
  { from: "requested", command: "decline", by: "reviewer", to: "declined", inventory: null },
  { from: "requested", command: "withdraw", by: "initiator", to: "withdrawn", inventory: null },
  { from: "approved", command: "cancel", by: "party", to: "cancelled", inventory: "release" },
  { from: "approved", command: "confirm", by: "party", to: "completed", inventory: "deduct" },
];

/**
 * 系統代 Reviewer 婉拒（CONTEXT.md Declined）：請求者失去資格時，Requested → Declined，沒有動作者
 */
export const SYSTEM_DECLINE = { from: "requested", to: "declined" } as const;

const OPEN_STATUSES: readonly WeaveStatus[] = ["requested", "approved"];

function holds(required: RequiredRole, roles: WeaveActorRoles): boolean {
  if (required === "reviewer") return roles.isReviewer;
  if (required === "initiator") return roles.isInitiator;
  return roles.isGiver || roles.isReceiver;
}

/**
 * 這個動作者能不能對目前狀態下這個命令；不能就丟 WeaveError：
 * 已結束 → 400 WEAVE_CLOSED；不是兩造也不是在審核 → 403；這個狀態沒有這個命令 → 400；身分不符 → 403。
 * `command` 為 null 代表 client 要的目標狀態沒有對應的命令
 */
export function decideTransition(
  status: WeaveStatus,
  roles: WeaveActorRoles,
  command: WeaveCommand | null,
): WeaveTransition {
  if (!OPEN_STATUSES.includes(status)) throw new WeaveError(400, "WEAVE_CLOSED", "Already closed");
  const isParty = roles.isGiver || roles.isReceiver;
  //* 組織 Post 的 Reviewer 不一定是兩造：只有在 Requested 審核時，非兩造才往下判斷
  const isReview = status === "requested" && (command === "approve" || command === "decline");
  if (!isParty && !isReview) throw new WeaveError(403, "FORBIDDEN", "Unauthorized");
  const transition = WEAVE_TRANSITIONS.find((t) => t.from === status && t.command === command);
  if (!transition)
    throw new WeaveError(400, "INVALID_STATUS_TRANSITION", "Invalid status transition");
  if (!holds(transition.by, roles))
    throw new WeaveError(403, "FORBIDDEN", `Only the ${transition.by} can ${transition.command}`);
  return transition;
}

/**
 * 這個人現在能下的命令（給畫面決定顯示哪些按鈕）。已確認過自己這一側就不再列 confirm
 */
export function availableCommands(
  status: WeaveStatus,
  roles: WeaveActorRoles,
  ownSideConfirmed: boolean,
): WeaveCommand[] {
  return WEAVE_TRANSITIONS.filter(
    (t) =>
      t.from === status &&
      holds(t.by, roles) &&
      !(t.command === "confirm" && ownSideConfirmed),
  ).map((t) => t.command);
}

/** HTTP `PATCH /api/weaves/:id/status` 收目標狀態；這裡把它對到命令（API 契約不變） */
export function commandForTargetStatus(status: WeaveStatus): WeaveCommand | null {
  switch (status) {
    case "approved":
      return "approve";
    case "declined":
      return "decline";
    case "withdrawn":
      return "withdraw";
    case "cancelled":
      return "cancel";
    case "completed":
      return "confirm";
    default:
      return null;
  }
}
