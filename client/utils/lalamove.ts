import type { Locale } from "@/i18n/routing";

export type LalamoveLanguage = "zh_TW" | "en_TW";

const LALAMOVE_LANGUAGES: Record<Locale, LalamoveLanguage> = {
  "zh-TW": "zh_TW",
  en: "en_TW",
};

/**
 * Lalamove market language for the current UI locale, so driver-facing text
 * matches the language the user is browsing in.
 */
export function toLalamoveLanguage(locale: Locale): LalamoveLanguage {
  return LALAMOVE_LANGUAGES[locale];
}

/**
 * Vehicle types offered for Lalamove TW. Display names, weight limits and use cases
 * live in the Lalamove.vehicles namespace of the translation catalogs, keyed by id.
 */
export const VEHICLE_TYPES = [
  "MOTORCYCLE",
  "SUV",
  "VAN",
  "TRUCK175",
  "TRUCK330",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_SIZE_LIMITS: Record<VehicleType, string> = {
  MOTORCYCLE: "40×40×40 cm",
  SUV: "100×100×100 cm",
  VAN: "150×100×100 cm",
  TRUCK175: "200×120×120 cm",
  TRUCK330: "300×150×150 cm",
};

export function isVehicleType(value: string): value is VehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

// Text sent to the Lalamove driver stays in Chinese whatever the UI locale,
// since TW drivers read Chinese; it is order data, not UI, so it lives outside the catalogs.
export const DEFAULT_SENDER_NAME = "寄件人";
export const DEFAULT_RECIPIENT_NAME = "收件人";

/** Combines the optional floor/unit and note into the remarks shown to the driver. */
export function buildDriverRemarks(
  floorUnit: string,
  note: string,
): string | undefined {
  const parts = [floorUnit ? `樓層門牌：${floorUnit}` : "", note].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join("，") : undefined;
}
