export type WeaveViewStatus =
  | "requested"
  | "approved"
  | "completed"
  | "declined"
  | "cancelled"
  | "withdrawn";

export type WeaveAction =
  "approve" | "decline" | "withdraw" | "confirm" | "cancel";

export interface WeaveViewModelInput {
  status: WeaveViewStatus | undefined;
  viewerId: number | undefined;
  postAuthorId: number | undefined;
  giverId: number;
  receiverId: number;
  giverConfirmed: boolean;
  receiverConfirmed: boolean;
}

export type WeaveStatusKey =
  | "newRequest"
  | "requestSent"
  | "weaving"
  | "weaved"
  | "declined"
  | "withdrawn"
  | "cancelled";

export type WeaveHintKey =
  | "requested.decideOnRequest"
  | "requested.awaitingAuthor"
  | "approved.confirmHandover"
  | "approved.confirmReceipt"
  | "approved.waitingForReceiver"
  | "approved.waitingForGiver"
  | "approved.receiverConfirmedPleaseConfirmHandover"
  | "approved.giverConfirmedPleaseConfirmReceipt";

export interface WeaveViewModel {
  /** i18n key of the status badge; null when status is unknown. */
  statusKey: WeaveStatusKey | null;
  /** i18n key of the hint line; null when no hint applies. */
  hintKey: WeaveHintKey | null;
  actions: ReadonlySet<WeaveAction>;
}

/**
 * Status badge key. Only the Requested stage depends on the viewer
 * (Post Author vs Initiator); other stages read the same for both parties.
 */
export function getWeaveStatusKey(
  status: WeaveViewStatus | undefined,
  isPostAuthor: boolean,
): WeaveStatusKey | null {
  switch (status) {
    case "requested":
      return isPostAuthor ? "newRequest" : "requestSent";
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
 * Requested stage is judged by Post Author / Initiator;
 * Approved stage by Giver / Receiver (ADR 0001).
 * The Initiator is the party who is not the Post Author.
 */
export function getWeaveViewModel(input: WeaveViewModelInput): WeaveViewModel {
  const actions = new Set<WeaveAction>();
  let hintKey: WeaveHintKey | null = null;
  const { status, viewerId } = input;
  const isPostAuthor =
    viewerId !== undefined && viewerId === input.postAuthorId;
  const statusKey = getWeaveStatusKey(status, isPostAuthor);
  const result = () => ({ statusKey, hintKey, actions });
  if (!status || viewerId === undefined) return result();

  const isGiver = viewerId === input.giverId;
  const isReceiver = viewerId === input.receiverId;
  if (!isGiver && !isReceiver) return result();

  if (status === "requested") {
    // Unknown Post Author: show nothing rather than guess the viewer's role.
    if (input.postAuthorId === undefined) return result();
    if (isPostAuthor) {
      actions.add("approve");
      actions.add("decline");
      hintKey = "requested.decideOnRequest";
    } else {
      actions.add("withdraw");
      hintKey = "requested.awaitingAuthor";
    }
  } else if (status === "approved") {
    const confirmedMine = isGiver
      ? input.giverConfirmed
      : input.receiverConfirmed;
    const confirmedOther = isGiver
      ? input.receiverConfirmed
      : input.giverConfirmed;
    if (!confirmedMine) actions.add("confirm");
    actions.add("cancel");

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

  return result();
}
