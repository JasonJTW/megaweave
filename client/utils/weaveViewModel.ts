import type { WeaveCommand, WeaveStatus, WeaveViewer } from "@/lib/weave";

export type WeaveViewStatus = WeaveStatus;
export type WeaveAction = WeaveCommand;

export interface WeaveViewModelInput {
  status: WeaveViewStatus | undefined;
  /** server 依轉移表算好的身分與可下的命令；沒有就不顯示任何動作 */
  viewer: WeaveViewer | undefined;
  giverConfirmed: boolean;
  receiverConfirmed: boolean;
}

export const WEAVE_STATUS_KEYS = [
  "newRequest",
  "requestSent",
  "weaving",
  "weaved",
  "declined",
  "withdrawn",
  "cancelled",
] as const;

export type WeaveStatusKey = (typeof WEAVE_STATUS_KEYS)[number];

export const WEAVE_HINT_KEYS = [
  "requested.decideOnRequest",
  "requested.awaitingAuthor",
  "approved.confirmHandover",
  "approved.confirmReceipt",
  "approved.waitingForReceiver",
  "approved.waitingForGiver",
  "approved.receiverConfirmedPleaseConfirmHandover",
  "approved.giverConfirmedPleaseConfirmReceipt",
] as const;

export type WeaveHintKey = (typeof WEAVE_HINT_KEYS)[number];

export interface WeaveViewModel {
  /** i18n key of the status badge; null when status is unknown. */
  statusKey: WeaveStatusKey | null;
  /** i18n key of the hint line; null when no hint applies. */
  hintKey: WeaveHintKey | null;
  actions: ReadonlySet<WeaveAction>;
}

/**
 * Status badge key. Only the Requested stage depends on the viewer
 * (the Reviewer decides, the Initiator waits); other stages read the same for both parties.
 */
export function getWeaveStatusKey(
  status: WeaveViewStatus | undefined,
  isReviewer: boolean,
): WeaveStatusKey | null {
  switch (status) {
    case "requested":
      return isReviewer ? "newRequest" : "requestSent";
    case "approved":
      return "weaving";
    case "completed":
      return "weaved";
    case "declined":
      return "declined";
    case "withdrawn":
      return "withdrawn";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

/**
 * 標籤與提示文字。可做的動作直接是 server 給的 `viewer.commands`（轉移表在 server），
 * 這裡只決定怎麼說：Requested 看 Reviewer / Initiator，Approved 看 Giver / Receiver 與確認狀態（ADR 0001）
 */
export function getWeaveViewModel(input: WeaveViewModelInput): WeaveViewModel {
  const { status, viewer } = input;
  const statusKey = getWeaveStatusKey(status, viewer?.isReviewer ?? false);
  const actions = new Set<WeaveAction>(viewer?.commands ?? []);
  let hintKey: WeaveHintKey | null = null;

  if (status === "requested" && viewer) {
    if (viewer.isReviewer) hintKey = "requested.decideOnRequest";
    else if (viewer.isInitiator) hintKey = "requested.awaitingAuthor";
  } else if (status === "approved" && viewer?.role) {
    const isGiver = viewer.role === "giver";
    const confirmedMine = isGiver
      ? input.giverConfirmed
      : input.receiverConfirmed;
    const confirmedOther = isGiver
      ? input.receiverConfirmed
      : input.giverConfirmed;
    if (!confirmedMine && confirmedOther) {
      hintKey = isGiver
        ? "approved.receiverConfirmedPleaseConfirmHandover"
        : "approved.giverConfirmedPleaseConfirmReceipt";
    } else if (!confirmedMine) {
      hintKey = isGiver
        ? "approved.confirmHandover"
        : "approved.confirmReceipt";
    } else if (!confirmedOther) {
      hintKey = isGiver
        ? "approved.waitingForReceiver"
        : "approved.waitingForGiver";
    }
  }

  return { statusKey, hintKey, actions };
}
