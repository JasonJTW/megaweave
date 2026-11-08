//* 組織報表（#143，PRD 0001 §5.1 E6-1、E6-2；ADR 0003、ADR 0005）
//* 純函式：輸入是流轉紀錄，輸出是報表數字；查詢在 orgReportService.ts。
//* - 件數＝物品數量（org_post_details.quantity、weave_items.quantity），不是貼文數
//* - 流通＝已完成（completed）的 Weave；一次 Weave 只算一次
//* - 各層去化：Weave 歸到「申請當下」物品所在的層級（org_post_tier_events），比例的分母都是上架總件數，
//*   所以各層比例相加＝總去化率（PRD §6「Tier 1 去化率＝內部認領件數 ÷ 上架件數」）
//* - 減碳量只用既有模型（estimateReport：重量 × 類別新品生產係數 × 取代率 R），不另寫公式
import {
  AvoidedEmissionsReport,
  estimateReport,
  getProductionFactor,
  ItemInput,
  ProductionFactor,
} from "./avoidedEmissions/avoidedEmissions";
import {
  CATEGORIES,
  CATEGORY_IDS,
  CategoryId,
  DEFAULT_REPLACEMENT_RATE,
  ReplacementRate,
  SOURCES,
} from "./avoidedEmissions/factorTable";
import type { AudienceTier } from "./postVisibility";

export const REPORT_TIERS: AudienceTier[] = ["internal", "members", "public"];

export interface ReportUnit {
  id: number;
  name: string;
}

export interface ReportPost {
  postId: number;
  unitId: number;
  /** 沒有 org_post_details 的舊資料為 null */
  orgCategory: CategoryId | null;
  quantity: number | null;
  unitWeightKg: number | null;
  weightIsDefault: boolean | null;
  /** 單件估算價值（新台幣） */
  estimatedValueTwd: number | null;
}

/** 已完成的 Weave（一筆一次） */
export interface ReportWeave {
  weaveId: number;
  postId: number;
  quantity: number;
  /** 申請時間，用來判斷當時的層級 */
  createdAt: Date;
  /** 流向單位；個人申請為 null（ADR 0004） */
  receiverUnitId: number | null;
}

export interface ReportTierEvent {
  postId: number;
  toTier: AudienceTier;
  createdAt: Date;
}

export interface ReportInput {
  units: ReportUnit[];
  posts: ReportPost[];
  weaves: ReportWeave[];
  tierEvents: ReportTierEvent[];
}

export interface TierStat {
  tier: AudienceTier;
  /** 曾經到過這一層的物品數（Internal＝全部） */
  reachedItemCount: number;
  weaveCount: number;
  quantity: number;
  /** quantity ÷ 上架總件數；沒有上架時為 null */
  rate: number | null;
}

export interface UnitStat {
  unit: ReportUnit;
  listedItemCount: number;
  listedQuantity: number;
  /** 這個單位的物品流出的件數 */
  givenQuantity: number;
  /** 代表這個單位申請、已完成的件數 */
  receivedQuantity: number;
  givenEstimatedKgCO2e: number;
}

export interface FactorView {
  categoryId: CategoryId;
  name: string;
  /** null＝這個類別不計入 */
  kgCO2ePerKg: number | null;
  method: ProductionFactor["method"];
  basis: ProductionFactor["basis"] | null;
  sources: { title: string; publisher: string; year: number; url: string }[];
}

export interface OrgReport {
  listing: { itemCount: number; quantity: number };
  circulation: { weaveCount: number; quantity: number; rate: number | null };
  tiers: TierStat[];
  units: UnitStat[];
  value: { estimatedValueTwd: number; valuedQuantity: number; unvaluedQuantity: number };
  emissions: {
    factorTableVersion: string;
    totalWeightKg: number;
    defaultWeightKg: number;
    /** 預設重量占總重的比例；沒有重量時為 null */
    defaultWeightShare: number | null;
    /** 潛在值（R = 1） */
    potentialKgCO2e: number;
    /** 估算值（× R） */
    estimatedKgCO2e: number;
    replacementRate: ReplacementRate & { source: { title: string; url: string } };
    countedQuantity: number;
    /** 不計入的件數：類別無係數、缺重量或缺物品資料 */
    uncountedQuantity: number;
    byCategory: (AvoidedEmissionsReport["byCategory"][number] & { name: string })[];
  };
  factors: FactorView[];
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** 物品在某個時間點所在的層級：該時間之前最後一筆事件的 to_tier，沒有事件就是 Internal */
function tierAt(events: ReportTierEvent[] | undefined, at: Date): AudienceTier {
  let tier: AudienceTier = "internal";
  for (const event of events ?? []) {
    if (event.createdAt.getTime() > at.getTime()) break;
    tier = event.toTier;
  }
  return tier;
}

function factorView(categoryId: CategoryId): FactorView {
  const factor = getProductionFactor(categoryId);
  return {
    categoryId,
    name: CATEGORIES[categoryId].nameZh,
    kgCO2ePerKg: factor.kgCO2ePerKg,
    method: factor.method,
    basis: factor.basis ?? null,
    sources: factor.sourceIds.map((id) => {
      const { title, publisher, year, url } = SOURCES[id];
      return { title, publisher, year, url };
    }),
  };
}

export function buildOrgReport(input: ReportInput): OrgReport {
  const postById = new Map(input.posts.map((p) => [p.postId, p]));
  const listedQuantityOf = (p: ReportPost) => p.quantity ?? 1;

  const eventsByPost = new Map<number, ReportTierEvent[]>();
  for (const event of [...input.tierEvents].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    const list = eventsByPost.get(event.postId) ?? [];
    list.push(event);
    eventsByPost.set(event.postId, list);
  }

  //* 只留這個組織物品的 Weave，並依 weaveId 去重（一次 Weave 只算一次）
  const seen = new Set<number>();
  const weaves = input.weaves.filter((w) => {
    if (!postById.has(w.postId) || seen.has(w.weaveId)) return false;
    seen.add(w.weaveId);
    return true;
  });

  const listedQuantity = input.posts.reduce((sum, p) => sum + listedQuantityOf(p), 0);
  const circulatedQuantity = weaves.reduce((sum, w) => sum + w.quantity, 0);

  const tiers = REPORT_TIERS.map((tier): TierStat => {
    const inTier = weaves.filter((w) => tierAt(eventsByPost.get(w.postId), w.createdAt) === tier);
    const quantity = inTier.reduce((sum, w) => sum + w.quantity, 0);
    const reachedItemCount =
      tier === "internal"
        ? input.posts.length
        : input.posts.filter((p) =>
            (eventsByPost.get(p.postId) ?? []).some((e) => e.toTier === tier),
          ).length;
    return { tier, reachedItemCount, weaveCount: inTier.length, quantity, rate: ratio(quantity, listedQuantity) };
  });

  //* 減碳量：有物品資料的 Weave 交給模型；沒有的另計為不計入
  const estimable = weaves.filter((w) => postById.get(w.postId)!.orgCategory !== null);
  const missingDetailsQuantity = weaves
    .filter((w) => postById.get(w.postId)!.orgCategory === null)
    .reduce((sum, w) => sum + w.quantity, 0);
  const model = estimateReport(
    estimable.map((w): ItemInput => {
      const p = postById.get(w.postId)!;
      return {
        categoryId: p.orgCategory!,
        quantity: w.quantity,
        unitWeightKg: p.unitWeightKg,
        weightIsDefault: p.weightIsDefault === true,
      };
    }),
  );
  const estimatedByWeave = new Map(
    estimable.map((w, i) => [w.weaveId, model.items[i].estimatedKgCO2e]),
  );
  const uncountedQuantity = model.uncountedQuantity + missingDetailsQuantity;

  const units = input.units.map((unit): UnitStat => {
    const listed = input.posts.filter((p) => p.unitId === unit.id);
    const given = weaves.filter((w) => postById.get(w.postId)!.unitId === unit.id);
    return {
      unit,
      listedItemCount: listed.length,
      listedQuantity: listed.reduce((sum, p) => sum + listedQuantityOf(p), 0),
      givenQuantity: given.reduce((sum, w) => sum + w.quantity, 0),
      receivedQuantity: weaves
        .filter((w) => w.receiverUnitId === unit.id)
        .reduce((sum, w) => sum + w.quantity, 0),
      givenEstimatedKgCO2e: given.reduce((sum, w) => sum + (estimatedByWeave.get(w.weaveId) ?? 0), 0),
    };
  });

  let estimatedValueTwd = 0;
  let valuedQuantity = 0;
  for (const w of weaves) {
    const value = postById.get(w.postId)!.estimatedValueTwd;
    if (value === null) continue;
    estimatedValueTwd += value * w.quantity;
    valuedQuantity += w.quantity;
  }

  const rateSource = SOURCES[DEFAULT_REPLACEMENT_RATE.sourceId];
  return {
    listing: { itemCount: input.posts.length, quantity: listedQuantity },
    circulation: {
      weaveCount: weaves.length,
      quantity: circulatedQuantity,
      rate: ratio(circulatedQuantity, listedQuantity),
    },
    tiers,
    units,
    value: { estimatedValueTwd, valuedQuantity, unvaluedQuantity: circulatedQuantity - valuedQuantity },
    emissions: {
      factorTableVersion: model.factorTableVersion,
      totalWeightKg: model.totalWeightKg,
      defaultWeightKg: model.defaultWeightKg,
      defaultWeightShare: ratio(model.defaultWeightKg, model.totalWeightKg),
      potentialKgCO2e: model.potentialKgCO2e,
      estimatedKgCO2e: model.estimatedKgCO2e,
      replacementRate: {
        ...DEFAULT_REPLACEMENT_RATE,
        source: { title: rateSource.title, url: rateSource.url },
      },
      countedQuantity: circulatedQuantity - uncountedQuantity,
      uncountedQuantity,
      byCategory: model.byCategory.map((c) => ({ ...c, name: CATEGORIES[c.categoryId].nameZh })),
    },
    factors: CATEGORY_IDS.map(factorView),
  };
}
