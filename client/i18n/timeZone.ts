import { TZDate } from "@date-fns/tz";

/**
 * The time zone every date is shown, picked and cut off in, on the server render
 * and in the browser, wherever the reader is.
 *
 * next-intl falls back to the server's zone (UTC in production) when the request
 * config omits one and hands it to NextIntlClientProvider, so the client then
 * formats in UTC too: a date picked as 2 Dec (local midnight, UTC+8) read
 * "1 Dec". The calendar takes the same zone, so a reader abroad picks and sees
 * the same day. MegaWeave serves Taiwan, so dates follow Taipei time.
 */
export const APP_TIME_ZONE = "Asia/Taipei";

/** The last moment (23:59:59.999) of the day `date` falls on in APP_TIME_ZONE. */
export function endOfDay(date: Date): Date {
  const end = new TZDate(date.getTime(), APP_TIME_ZONE);
  end.setHours(23, 59, 59, 999);
  return new Date(end.getTime());
}

/** Whether `date` falls on a day before today in APP_TIME_ZONE; such a day can't be an expiry date. */
export function isBeforeToday(date: Date, now: Date = new Date()): boolean {
  const startOfToday = new TZDate(now.getTime(), APP_TIME_ZONE);
  startOfToday.setHours(0, 0, 0, 0);
  return date.getTime() < startOfToday.getTime();
}
