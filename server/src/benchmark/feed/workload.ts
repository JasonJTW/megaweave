// server/src/benchmark/feed/workload.ts
// 瀏覽器式 feed workload：每個虛擬使用者依固定身分與 seed 產生可重現的請求序列，
// query 參數與 client 首頁 (client/app/page.tsx) 及 Tinder 卡片 (TinderFeed.tsx) 相同。

import type { Random } from "../fixture/random";

export type PersonaKind = "returning" | "cold-start" | "anonymous";

export interface FeedPersona {
  kind: PersonaKind;
  /** 已登入使用者的 session id；anonymous 沒有 */
  sessionId?: string;
  /** 瀏覽器提供的定位；未授權定位時為 undefined */
  coordinates?: { lat: number; lng: number };
}

export interface FeedRequest {
  requestClass: string;
  query: Record<string, string>;
  sessionId?: string;
}

export interface WorkloadCatalog {
  categoryIds: readonly number[];
}

/**
 * 每 10 個虛擬使用者：5 位有興趣向量的回訪使用者、2 位尚無興趣向量的新使用者、3 位訪客。
 * 固定順序而非隨機抽樣，讓 5 / 10 / 20 VU 的身分比例一致且可比較。
 */
const PERSONA_PATTERN: readonly PersonaKind[] = [
  "returning", "anonymous", "cold-start", "returning", "anonymous",
  "returning", "cold-start", "returning", "anonymous", "returning",
];

export function personaKindFor(virtualUserIndex: number): PersonaKind {
  return PERSONA_PATTERN[virtualUserIndex % PERSONA_PATTERN.length];
}

/** 每次請求後繼續往下捲動同一個列表的機率，以及最多捲動到的頁數 */
export const SCROLL_PROBABILITY = 0.6;
export const MAX_SCROLL_PAGES = 5;
const HOME_PAGE_LIMIT = "12";
const TINDER_PAGE_LIMIT = "50";
const TINDER_RADII_KM = ["8", "15", "30", null] as const;

type ViewKind = "home" | "filter-category" | "filter-type" | "tinder";

/** 開啟新列表時的畫面比例 */
export const VIEW_MIX: readonly (readonly [ViewKind, number])[] = [
  ["home", 0.6],
  ["filter-category", 0.15],
  ["filter-type", 0.1],
  ["tinder", 0.15],
];

interface View {
  requestClass: string;
  query: Record<string, string>;
  page: number;
}

function homeRequestClass(persona: FeedPersona): string {
  if (persona.kind === "returning") return "home-personalized";
  return persona.coordinates ? "home-geo" : "home-trending";
}

export function createVirtualUserScript(
  persona: FeedPersona,
  catalog: WorkloadCatalog,
  random: Random,
): () => FeedRequest {
  const location: Record<string, string> = persona.coordinates
    ? { lat: String(persona.coordinates.lat), lng: String(persona.coordinates.lng) }
    : {};
  let view: View | null = null;

  const openView = (): View => {
    let kind = random.weighted(VIEW_MIX);
    // Tinder 卡片需要定位才會發出請求
    if (kind === "tinder" && !persona.coordinates) kind = "home";

    switch (kind) {
      case "tinder": {
        const radius = random.pick(TINDER_RADII_KM);
        return {
          requestClass: "tinder",
          query: { limit: TINDER_PAGE_LIMIT, mode: "tinder", ...location, ...(radius ? { radius } : {}) },
          page: 1,
        };
      }
      case "filter-category":
        return {
          requestClass: "filter-category",
          query: { limit: HOME_PAGE_LIMIT, category_id: String(random.pick(catalog.categoryIds)), ...location },
          page: 1,
        };
      case "filter-type":
        return {
          requestClass: "filter-type",
          query: { limit: HOME_PAGE_LIMIT, type: random.pick(["share", "wish"]), ...location },
          page: 1,
        };
      default:
        return { requestClass: homeRequestClass(persona), query: { limit: HOME_PAGE_LIMIT, ...location }, page: 1 };
    }
  };

  return () => {
    if (view && view.page < MAX_SCROLL_PAGES && random.chance(SCROLL_PROBABILITY)) {
      view.page++;
    } else {
      view = openView();
    }
    return {
      requestClass: view.requestClass,
      query: { page: String(view.page), ...view.query },
      ...(persona.sessionId ? { sessionId: persona.sessionId } : {}),
    };
  };
}
