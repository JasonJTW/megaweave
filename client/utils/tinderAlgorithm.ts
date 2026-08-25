/**
 * client/utils/tinderAlgorithm.ts
 * Tinder 推薦演算法引擎：
 * 1. 大幅強化非線性距離衰減 (Steep Non-Linear Distance Decay)
 * 2. 即時活躍度與時效衰減 (Activity & Recency Decay)
 * 3. 動態熱門吸引力 (Desirability / Hotness Score)
 * 4. 冷啟動探索獎勵 (Cold-Start Exploration Boost)
 * 5. 硬性搜尋半徑篩選 (Hard Geofence Radius Filtering)
 */

import type { Post } from "../app/types/schema";
import { calculateDistanceKm } from "./locationUtils";

export type TinderAlgorithmMode =
  | "tinder_smart" // 🎯 Tinder 智慧推薦 (距離 40% + 時效 35% + 熱門 15% + 探索 10%)
  | "proximity" // 📍 近距離生活圈 (距離 75% + 時效 25%)
  | "trending" // 🔥 熱門精選 (熱門 65% + 距離 20% + 時效 15%)
  | "latest"; // ✨ 最新發布 (時效 75% + 距離 25%)

export type DistanceRadiusOption = number | null; // km (null = 不限半徑)

export interface TinderScoringOptions {
  mode?: TinderAlgorithmMode;
  maxDistanceKm?: DistanceRadiusOption;
  sigmaKm?: number; // 距離衰減常數 (預設 7.0km，越小衰減越劇烈)
}

export interface ScoredPost {
  post: Post;
  distanceKm: number | null;
  distanceScore: number;
  recencyScore: number;
  hotScore: number;
  explorationScore: number;
  finalScore: number;
}

/**
 * ⚡ 計算大幅非線性距離衰減分數 (Steep Non-linear Distance Decay)
 * 使用超指數 / 冪次高斯衰減公式：
 *   S_dist = exp( - (d / sigma)^1.5 )
 * 當 sigma = 7km 時：
 *   - 0.5 km -> 0.98 (極近超高分)
 *   - 2.0 km -> 0.86 (生活圈內高分)
 *   - 5.0 km -> 0.55 (開始急遽下滑)
 *   - 15.0 km -> 0.04 (大幅衰減)
 *   - 30.0 km -> 0.0001 (接近 0 分)
 */
export function calculateSteepDistanceDecay(
  distanceKm: number | null,
  sigmaKm: number = 7.0,
): number {
  if (distanceKm === null || isNaN(distanceKm) || distanceKm < 0) {
    // 若無距離資訊，給予中立低基準分數 (0.2)
    return 0.2;
  }
  if (distanceKm <= 0.2) {
    return 1.0;
  }

  // 冪次非線性指數衰減
  const ratio = distanceKm / Math.max(1, sigmaKm);
  return Math.exp(-Math.pow(ratio, 1.5));
}

/**
 * 🕒 計算時間時效性分數 (Soft Recency / Freshness Decay)
 * 採用平緩反比衰減，確保上個月但仍在架上的超近優質好物不會因發布時間而被抹殺
 * 7天內 ~ 0.81, 30天內 ~ 0.50, 60天內 ~ 0.33
 */
export function calculateRecencyScore(createdAt?: string | null): number {
  if (!createdAt) return 0.5;
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 0.5;

  const now = Date.now();
  const diffDays = Math.max(0, (now - createdTime) / (1000 * 60 * 60 * 24));

  return 1 / (1 + diffDays / 30);
}

/**
 * 🔥 計算動態熱門吸引力分數 (Normalized Hotness / Desirability)
 */
export function calculateDesirabilityScore(post: Post): number {
  const hot = Number(post.hot_score || 0);
  const likes = Number(post.likes_count || 0);
  const views = Number(post.view_count || 0);

  // 綜合點讚與瀏覽熱度
  const rawScore = hot * 0.7 + likes * 3.0 + views * 0.2;
  return Math.min(1.0, Math.log10(1 + rawScore) / 2.5);
}

/**
 * 🎲 計算冷啟動探索加權 (Cold-Start Exploration Boost)
 * 為 6 小時內新發布的貼文提供隨機曝光加權，打破老貼文壟斷
 */
export function calculateExplorationBonus(createdAt?: string | null): number {
  if (!createdAt) return 0;
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 0;

  const now = Date.now();
  const diffHours = (now - createdTime) / (1000 * 60 * 60);

  if (diffHours <= 6) {
    return 0.25 * (1 - diffHours / 6);
  }
  return 0;
}

/**
 * 🎯 計算單則貼文的 Tinder 綜合推薦得分
 */
export function calculateTinderScore(
  post: Post,
  userCoords: { lat: number; lng: number } | null | undefined,
  options: TinderScoringOptions = {},
): ScoredPost {
  const { mode = "tinder_smart", sigmaKm = 7.0 } = options;

  // 1. 計算精確地理距離
  let distanceKm: number | null = null;
  if (
    userCoords &&
    post.lat !== undefined &&
    post.lat !== null &&
    post.lng !== undefined &&
    post.lng !== null &&
    !(Number(post.lat) === 0 && Number(post.lng) === 0)
  ) {
    distanceKm = calculateDistanceKm(
      Number(userCoords.lat),
      Number(userCoords.lng),
      Number(post.lat),
      Number(post.lng),
    );
  }

  // 2. 計算各維度子分數
  const distanceScore = calculateSteepDistanceDecay(distanceKm, sigmaKm);
  const recencyScore = calculateRecencyScore(post.created_at);
  const hotScore = calculateDesirabilityScore(post);
  const explorationScore = calculateExplorationBonus(post.created_at);

  // 3. 依演算法模式分配權重 (大幅強化距離主導地位)
  let finalScore = 0;

  switch (mode) {
    case "proximity":
      // 📍 距離優先：超強距離權重 85% + 時效 15%
      finalScore = 0.85 * distanceScore + 0.15 * recencyScore;
      break;

    case "trending":
      // 🔥 熱門精選：熱門 55% + 距離 35% + 時效 10%
      finalScore =
        0.55 * hotScore + 0.35 * distanceScore + 0.1 * recencyScore;
      break;

    case "latest":
      // ✨ 最新發布：時效 65% + 距離 35%
      finalScore = 0.65 * recencyScore + 0.35 * distanceScore;
      break;

    case "tinder_smart":
    default:
      // 🎯 Tinder 智慧推薦：距離衰減 65% + 活躍時效 20% + 熱門吸引力 10% + 冷啟動探索 5%
      finalScore =
        0.65 * distanceScore +
        0.2 * recencyScore +
        0.1 * hotScore +
        0.05 * explorationScore;
      break;
  }

  // 4. 超近生活圈專屬加成 (Neighborhood Proximity Boost)
  // 3km 內步行/單車生活圈給予顯著額外加成，確保身邊好物第一時間置頂
  if (distanceKm !== null) {
    if (distanceKm <= 3.0) {
      finalScore += 0.35; // 3km 內直接加 0.35 分置頂
    } else if (distanceKm <= 7.0) {
      finalScore += 0.15; // 7km 內同城加 0.15 分
    }
  }

  // 5. 過期懲罰：已過期貼文大幅扣分
  const isExpired = post.expires_at
    ? new Date(post.expires_at).getTime() < Date.now()
    : false;
  if (isExpired) {
    finalScore -= 50.0;
  }

  return {
    post,
    distanceKm,
    distanceScore,
    recencyScore,
    hotScore,
    explorationScore,
    finalScore,
  };
}

/**
 * 🚀 套用 Tinder 演算法重排貼文佇列 (支援硬性半徑過濾與非線性重排)
 */
export function rankPostsWithTinderAlgorithm(
  posts: Post[],
  userCoords: { lat: number; lng: number } | null | undefined,
  options: TinderScoringOptions = {},
): Post[] {
  const { maxDistanceKm = null } = options;

  // 1. 硬性地理圍欄篩選 (Hard Geofence Filtering)
  const filteredPosts = posts.filter((post) => {
    if (maxDistanceKm === null) return true;
    if (!userCoords) return true; // 若無定位則不強制濾除

    // 若貼文無經緯度，允許保留但排序會因距離衰減排後
    if (
      post.lat === undefined ||
      post.lat === null ||
      post.lng === undefined ||
      post.lng === null ||
      (Number(post.lat) === 0 && Number(post.lng) === 0)
    ) {
      return true;
    }

    const dist = calculateDistanceKm(
      Number(userCoords.lat),
      Number(userCoords.lng),
      Number(post.lat),
      Number(post.lng),
    );

    return dist <= maxDistanceKm;
  });

  // 2. 計算 Tinder 多因子分數並降冪排序
  const scored = filteredPosts.map((post) =>
    calculateTinderScore(post, userCoords, options),
  );

  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored.map((s) => s.post);
}

/**
 * 🏷️ 5 個標準距離級距結構
 */
export interface DistanceTier {
  index: number;
  distanceKm: number | null; // null represents "不限距離"
  label: string; // e.g. "3 km" 或 "不限"
  badgeLabel: string; // e.g. "15 km (同城生活圈)"
  desc: string; // e.g. "同城生活圈"
}

/**
 * 📊 固定 5 個標準生活圈距離級距 (穩定不隨背景分頁載入而跳動)
 */
export const DISTANCE_TIERS: DistanceTier[] = [
  {
    index: 0,
    distanceKm: 3,
    label: "3 km",
    badgeLabel: "3 km (超近步行圈)",
    desc: "超近步行",
  },
  {
    index: 1,
    distanceKm: 8,
    label: "8 km",
    badgeLabel: "8 km (鄰近生活圈)",
    desc: "鄰近生活圈",
  },
  {
    index: 2,
    distanceKm: 15,
    label: "15 km",
    badgeLabel: "15 km (同城生活圈)",
    desc: "同城生活圈",
  },
  {
    index: 3,
    distanceKm: 30,
    label: "30 km",
    badgeLabel: "30 km (跨區大生活圈)",
    desc: "跨區大生活圈",
  },
  {
    index: 4,
    distanceKm: null,
    label: "不限",
    badgeLabel: "不限距離 (全區推薦)",
    desc: "全區推薦",
  },
];

export function calculateDistanceTiers(): DistanceTier[] {
  return DISTANCE_TIERS;
}
