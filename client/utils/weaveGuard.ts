export interface WeaveItemCheck {
  id?: number;
  post_id?: number;
  status?: string;
}

/**
 * Checks whether the given list of weaves contains at least one weave
 * for the specified post ID with a status of 'pending'.
 */
export function hasPendingWeaveForPost(
  weaves: WeaveItemCheck[] | null | undefined,
  postId: number,
): boolean {
  if (!Array.isArray(weaves) || weaves.length === 0) {
    return false;
  }

  return weaves.some(
    (w) => w.post_id === postId && w.status === "pending",
  );
}

export type LalamoveActionType = "recalculate" | "book" | "weave_this";

export interface LalamoveActionState {
  action: LalamoveActionType;
}

/**
 * Determines the action button state for the Lalamove quotation summary.
 * - If quotation is expired, always prompt recalculation.
 * - If quotation is valid and user has a pending weave for this post, allow booking.
 * - Otherwise (no pending weave), restrict to 'weave_this'.
 */
export function getLalamoveActionState({
  isQuoteExpired,
  hasPendingWeave,
}: {
  isQuoteExpired: boolean;
  hasPendingWeave: boolean;
}): LalamoveActionState {
  if (isQuoteExpired) {
    return { action: "recalculate" };
  }

  if (hasPendingWeave) {
    return { action: "book" };
  }

  return { action: "weave_this" };
}

/**
 * Determines whether LalamoveQuotation should be displayed below WeavingCard.
 * It is displayed only when in chat window, the weave status is 'pending', and post data exists.
 */
export function shouldShowLalamoveQuotation({
  isInChatWindow,
  status,
  hasPost,
}: {
  isInChatWindow?: boolean;
  status?: string | null;
  hasPost?: boolean;
}): boolean {
  return Boolean(isInChatWindow && status === "pending" && hasPost);
}
