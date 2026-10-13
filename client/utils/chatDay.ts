import { isSameDay, subDays } from "date-fns";

export type ChatDayLabel = "today" | "yesterday" | "date";

/** How the date divider in a chat names the day a message was sent, in the reader's local time. */
export function chatDayLabel(date: Date, now: Date): ChatDayLabel {
  if (isSameDay(date, now)) return "today";
  if (isSameDay(date, subDays(now, 1))) return "yesterday";
  return "date";
}
