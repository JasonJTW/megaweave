/**
 * client/utils/locationUtils.ts
 * 地點解析、格式化與距離計算工具函式
 */
export type PostLocationField = "province" | "city" | "route" | "location_name";

/**
 * Google Places Autocomplete 統一請求欄位清單
 */
export const GOOGLE_AUTOCOMPLETE_FIELDS = [
  "name",
  "formatted_address",
  "address_components",
  "geometry",
  "place_id",
  "url",
];

export interface ParsedGooglePlace {
  place_id?: string;
  name?: string;
  url?: string;
  full_address: string;
  province: string;
  city: string;
  route: string;
  zip: string;
  zip_code: string;
  lat?: number;
  lng?: number;
}

/**
 * 統一解析 Google Places Autocomplete 的 PlaceResult 物件
 * 完整支援台灣直轄市與各縣轄鄉鎮市區（含 locality 與 sublocality_level_2）
 */
export function parseGooglePlace(
  place: google.maps.places.PlaceResult | null | undefined,
): ParsedGooglePlace {
  if (!place) {
    return {
      full_address: "",
      province: "",
      city: "",
      route: "",
      zip: "",
      zip_code: "",
    };
  }

  let province = "";
  let city = "";
  let route = "";
  let zip = "";

  const components = place.address_components || [];

  // 第一階段：解析縣市 (administrative_area_level_1)
  for (const comp of components) {
    if (comp.types.includes("administrative_area_level_1")) {
      province = comp.long_name;
      break;
    }
  }

  // 第二階段：解析鄉鎮市區、街道、郵遞區號
  for (const comp of components) {
    const types = comp.types;

    // 鄉鎮市區：包含 sublocality_level_1, sublocality_level_2, administrative_area_level_2,
    // 以及非直轄市的 locality（例如 彰化縣「員林市」、屏東縣「恆春鎮」）
    if (
      types.includes("sublocality_level_1") ||
      types.includes("administrative_area_level_2") ||
      types.includes("sublocality_level_2")
    ) {
      city = comp.long_name;
    } else if (
      types.includes("locality") &&
      (!province || comp.long_name !== province)
    ) {
      if (!city) {
        city = comp.long_name;
      }
    }

    // 街道
    if (types.includes("route")) {
      route = comp.long_name;
    }

    // 郵遞區號
    if (types.includes("postal_code")) {
      zip = comp.long_name;
    }
  }

  const lat =
    typeof place.geometry?.location?.lat === "function"
      ? place.geometry.location.lat()
      : undefined;
  const lng =
    typeof place.geometry?.location?.lng === "function"
      ? place.geometry.location.lng()
      : undefined;

  const full_address = place.formatted_address || place.name || "";

  return {
    place_id: place.place_id,
    name: place.name || undefined,
    url: place.url || undefined,
    full_address,
    province,
    city,
    route,
    zip,
    zip_code: zip,
    lat,
    lng,
  };
}

export interface LocationDisplayPart {
  field: PostLocationField;
  value: string;
}

/**
 * 產生可供點擊篩選或分段顯示的地點資訊片段
 * 優先序：縣市 -> 鄉鎮市區 -> 地點名稱 (若無則顯示街道)
 */
export function buildLocationDisplayParts(post?: {
  province?: string | null;
  city?: string | null;
  route?: string | null;
  location_name?: string | null;
}): LocationDisplayPart[] {
  if (!post) return [];

  const parts: LocationDisplayPart[] = [];
  const added = new Set<string>();

  const add = (field: PostLocationField, value?: string | null) => {
    if (value && !added.has(value)) {
      parts.push({ field, value });
      added.add(value);
      return true;
    }
    return false;
  };

  add("province", post.province);
  add("city", post.city);
  if (!add("location_name", post.location_name)) {
    add("route", post.route);
  }

  return parts;
}

/**
 * 組合簡明易讀的地點顯示字串
 * 範例："台北市大安區大安森林公園" 或 "新北市板橋區縣民大道二段"
 * 若結構化資訊皆為空，則 fallback 回 full_address
 */
export function formatLocationText(post?: {
  province?: string | null;
  city?: string | null;
  route?: string | null;
  location_name?: string | null;
  full_address?: string | null;
}): string {
  if (!post) return "";

  const parts = buildLocationDisplayParts(post);
  if (parts.length > 0) {
    return parts.map((p) => p.value).join("");
  }
  return post.full_address || "";
}

/**
 * Calculates the Haversine distance in kilometers between two coordinates.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in kilometers into a human-friendly string.
 * Examples: "< 0.1 km", "1.2 km", "15 km"
 */
export function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 0.1) {
    return "< 0.1 km";
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }
  return `${Math.round(distanceKm)} km`;
}

/**
 * Calculates and returns the formatted distance string between user's current coords
 * and the post's coordinates, or null if coordinates are unavailable.
 */
export function getPostDistance(
  userCoords: { lat: number; lng: number } | null | undefined,
  postLat?: number | string | null,
  postLng?: number | string | null,
): string {
  if (
    !userCoords ||
    postLat === undefined ||
    postLat === null ||
    postLng === undefined ||
    postLng === null
  ) {
    return "";
  }

  const lat1 = Number(userCoords.lat);
  const lon1 = Number(userCoords.lng);
  const lat2 = Number(postLat);
  const lon2 = Number(postLng);

  if (
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2) ||
    (lat2 === 0 && lon2 === 0)
  ) {
    return "";
  }

  const dist = calculateDistanceKm(lat1, lon1, lat2, lon2);
  return formatDistanceKm(dist);
}
