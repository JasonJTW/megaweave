import type { Weave } from "@/services/weaveService";

type WeaveStatus = Weave["status"];

export interface WeaveItemCheck {
  post_id?: number;
  status?: WeaveStatus;
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

  return weaves.some((w) => w.post_id === postId && w.status === "pending");
}

export type LalamoveAction = "recalculate" | "book" | "weave_this";

/**
 * Determines the action button state for the Lalamove quotation summary.
 * - If quotation is expired, always prompt recalculation.
 * - If quotation is valid and user has a pending weave for this post, allow booking.
 * - Otherwise (no pending weave), restrict to 'weave_this'.
 */
export function getLalamoveAction({
  isQuoteExpired,
  hasPendingWeave,
}: {
  isQuoteExpired: boolean;
  hasPendingWeave: boolean;
}): LalamoveAction {
  if (isQuoteExpired) {
    return "recalculate";
  }

  if (hasPendingWeave) {
    return "book";
  }

  return "weave_this";
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
  status?: WeaveStatus | null;
  hasPost?: boolean;
}): boolean {
  return Boolean(isInChatWindow && status === "pending" && hasPost);
}
