/**
 * Language of the addresses sent to Lalamove (the `language` field of a quotation).
 * Deliberately fixed to zh_TW instead of following the UI locale: delivery only runs
 * in Taiwan for the foreseeable future, TW drivers mostly read Chinese, the TW market
 * only documents zh_TW, and the addresses (from Google, TW-restricted) and driver
 * remarks are always Chinese. Revisit when expanding to markets outside Taiwan.
 */
export const LALAMOVE_LANGUAGE = "zh_TW";

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

// Text sent to the Lalamove driver stays in Chinese whatever the UI locale (see
// LALAMOVE_LANGUAGE); it is order data, not UI, so it lives outside the catalogs.
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
