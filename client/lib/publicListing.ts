//* 組織物品升到 Public 前要補齊的公開資訊（server: orgPublicListing）。
//* 組織物品上架時沒有地點、到期日與標籤；進公開 Feed 之前要像一般貼文一樣有地點、到期日與分類，標籤選填。
//* 這裡只有資料轉換與檢查，畫面在 components/org/PublicListingFields

import type { ParsedGooglePlace } from "@/utils/locationUtils";

/** GET /api/orgs/:orgId/items/:itemId/public-listing：目前存的公開資訊，沒填過為 null */
export interface PublicListing {
  categoryId: number | null;
  tags: string | null;
  expiresAt: string | null;
  location: {
    placeId: string;
    name: string | null;
    url: string | null;
    fullAddress: string;
    province: string | null;
    city: string | null;
    route: string | null;
    zipCode: string | null;
    lat: number;
    lng: number;
  } | null;
}

/** 選好的地點：必須來自 Google 地點建議（有 place_id 與經緯度），只打字不算 */
export interface PickedLocation {
  place_id: string;
  full_address: string;
  name: string | null;
  url: string | null;
  province: string | null;
  city: string | null;
  route: string | null;
  zip_code: string | null;
  lat: number;
  lng: number;
}

/** 確認框的表單狀態 */
export interface PublicListingDraft {
  categoryId: number | null;
  tags: string[];
  /** 到期「日」；送出時換成當天結束 */
  expiresOn: Date | undefined;
  /** 地址輸入框的文字；改了文字就要重新從建議選，location 會清掉 */
  locationText: string;
  location: PickedLocation | null;
}

export type PublicListingField = "location" | "expiresOn" | "categoryId";

/** POST pending-public 的 `listing` */
export interface PublicListingPayload {
  categoryId: number;
  tags: string | null;
  expiresAt: string;
  location: PickedLocation;
}

export function splitTags(tags: string | null | undefined): string[] {
  return (tags ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter((tag, i, all) => tag !== "" && all.indexOf(tag) === i);
}

export function draftFromListing(listing: PublicListing): PublicListingDraft {
  const location = listing.location
    ? {
        place_id: listing.location.placeId,
        full_address: listing.location.fullAddress,
        name: listing.location.name,
        url: listing.location.url,
        province: listing.location.province,
        city: listing.location.city,
        route: listing.location.route,
        zip_code: listing.location.zipCode,
        lat: listing.location.lat,
        lng: listing.location.lng,
      }
    : null;
  return {
    categoryId: listing.categoryId,
    tags: splitTags(listing.tags),
    expiresOn: listing.expiresAt ? new Date(listing.expiresAt) : undefined,
    locationText: location?.full_address ?? "",
    location,
  };
}

/** Google 地點建議選好的結果；沒有 place_id 或經緯度的（例如只按 Enter）回 null */
export function pickedLocationFrom(
  parsed: ParsedGooglePlace,
): PickedLocation | null {
  if (!parsed.place_id || parsed.lat === undefined || parsed.lng === undefined)
    return null;
  return {
    place_id: parsed.place_id,
    full_address: parsed.full_address,
    name: parsed.name || null,
    url: parsed.url || null,
    province: parsed.province || null,
    city: parsed.city || null,
    route: parsed.route || null,
    zip_code: parsed.zip_code || parsed.zip || null,
    lat: parsed.lat,
    lng: parsed.lng,
  };
}

/** 到期日當天的最後一刻（當地時間）：選今天也還沒過期，與一般貼文「選到哪天就到哪天」一致 */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** 還沒填好的必填欄位；空陣列代表可以送出 */
export function missingListingFields(
  draft: PublicListingDraft,
  now: Date = new Date(),
): PublicListingField[] {
  const missing: PublicListingField[] = [];
  if (!draft.location) missing.push("location");
  if (
    !draft.expiresOn ||
    endOfDay(draft.expiresOn).getTime() <= now.getTime()
  ) {
    missing.push("expiresOn");
  }
  if (draft.categoryId === null) missing.push("categoryId");
  return missing;
}

/** 填好的草稿轉成 API 的 `listing`；有缺欄位回 null */
export function listingPayload(
  draft: PublicListingDraft,
  now: Date = new Date(),
): PublicListingPayload | null {
  if (missingListingFields(draft, now).length > 0) return null;
  return {
    categoryId: draft.categoryId!,
    tags: draft.tags.length > 0 ? draft.tags.join(", ") : null,
    expiresAt: endOfDay(draft.expiresOn!).toISOString(),
    location: draft.location!,
  };
}
