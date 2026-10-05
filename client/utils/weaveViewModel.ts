export type WeaveViewStatus =
  | "requested"
  | "pending"
  | "completed"
  | "rejected"
  | "cancelled"
  | "withdrawn";

export type WeaveAction =
  | "approve"
  | "decline"
  | "withdraw"
  | "confirm"
  | "cancel";

export interface WeaveViewModelInput {
  status: WeaveViewStatus | undefined;
  viewerId: number | undefined;
  postAuthorId: number | undefined;
  giverId: number;
  receiverId: number;
  giverConfirmed: boolean;
  receiverConfirmed: boolean;
}

export interface WeaveViewModel {
  actions: ReadonlySet<WeaveAction>;
}

/**
 * Requested stage is judged by Post Author / Initiator;
 * Approved ("pending") stage by Giver / Receiver (ADR 0001).
 * The Initiator is the party who is not the Post Author.
 */
export function getWeaveViewModel(input: WeaveViewModelInput): WeaveViewModel {
  const actions = new Set<WeaveAction>();
  const { status, viewerId } = input;
  if (!status || viewerId === undefined) return { actions };

  const isGiver = viewerId === input.giverId;
  const isReceiver = viewerId === input.receiverId;
  if (!isGiver && !isReceiver) return { actions };

  if (status === "requested") {
    if (viewerId === input.postAuthorId) {
      actions.add("approve");
      actions.add("decline");
    } else {
      actions.add("withdraw");
    }
  } else if (status === "pending") {
    const confirmedMine = isGiver
      ? input.giverConfirmed
      : input.receiverConfirmed;
    if (!confirmedMine) actions.add("confirm");
    actions.add("cancel");
  }

  return { actions };
}
