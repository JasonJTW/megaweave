/** A week: past this age a relative time ("6 days ago") stops being useful. */
const RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type CommentTimeDisplay =
  /** Render with Intl.RelativeTimeFormat — "5 minutes ago" / "5 分鐘前" */
  | { kind: "relative"; value: Date }
  /** Render as a calendar date in the active locale */
  | { kind: "absolute"; value: Date };

/**
 * Decides how a comment's timestamp should read, leaving the locale-aware wording
 * to next-intl's formatter. Returns null for unparsable timestamps so callers can
 * render nothing rather than "Invalid Date".
 */
export function commentTimeDisplay(
  createdAt: string,
  now: Date,
): CommentTimeDisplay | null {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return null;

  // Clock skew between the DB and the browser would otherwise read "in 3 minutes"
  const value = parsed.getTime() > now.getTime() ? now : parsed;
  const age = now.getTime() - value.getTime();

  return age < RELATIVE_WINDOW_MS
    ? { kind: "relative", value }
    : { kind: "absolute", value };
}
