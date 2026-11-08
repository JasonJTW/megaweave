// server/src/services/avoidedEmissions/avoidedEmissions.ts
// 二手物再使用的避免排放量估算（純函式，無 I/O）。
//
//   潛在值（1:1 取代）  P = 重量 kg × 類別生產係數 EF (kgCO2e/kg)
//   估算值（含取代率）  A = P × 取代率 R
//
// EF：家具類 = min(材質組成 × 環境部材質係數, 參考產品 EPD 的 A1–A3 平均)；
//     電子類 = EPA WARM v16 產品係數；其他 = 固定材質組成 × 環境部材質係數。
//
// 方法學與論證：docs/notes/avoided-emissions-model.md
// 數字只能來自 factorTable.ts；不計入的類別回傳 0 並標記狀態，不猜值。

import {
  BomComponent,
  CATEGORIES,
  CATEGORY_IDS,
  CategoryId,
  DEFAULT_REPLACEMENT_RATE,
  FACTOR_TABLE_VERSION,
  FactorMethod,
  KG_PER_SHORT_TON,
  MATERIAL_FACTORS,
  MIN_SURVEY_SAMPLE,
  PRODUCT_FACTORS,
  ReferenceProduct,
  SourceId,
} from "./factorTable";

// ---------------------------------------------------------------------------
// 係數推導
// ---------------------------------------------------------------------------

/** BOM 加權係數 = Σ(元件量 × 材質係數) ÷ Σ元件量；無係數的元件計 0 但留在分母 */
export function bomFactor(components: readonly BomComponent[]): number {
  let total = 0;
  let emissions = 0;
  for (const component of components) {
    if (!(component.amount > 0)) {
      throw new RangeError(`BOM amount must be positive: ${component.label}`);
    }
    total += component.amount;
    if (component.material !== null) {
      emissions +=
        component.amount * MATERIAL_FACTORS[component.material].kgCO2ePerKg;
    }
  }
  if (total === 0) throw new RangeError("BOM is empty");
  return emissions / total;
}

/** WARM 的 MTCO2E/short ton 換成 kgCO2e/kg */
export function shortTonToKgFactor(mtco2ePerShortTon: number): number {
  return (mtco2ePerShortTon * 1000) / KG_PER_SHORT_TON;
}

/** 參考產品 EPD 的 A1–A3 質量加權平均 = ΣGWP ÷ Σ重量 */
export function referenceEpdFactor(
  products: readonly ReferenceProduct[],
): number {
  let mass = 0;
  let gwp = 0;
  for (const product of products) {
    mass += product.declaredMassKg;
    gwp += product.a1a3KgCO2e;
  }
  if (mass === 0) throw new RangeError("No reference products");
  return gwp / mass;
}

export interface ProductionFactor {
  categoryId: CategoryId;
  /** null = 類別不計入 */
  kgCO2ePerKg: number | null;
  method: FactorMethod["kind"];
  /**
   * 參考產品類別才有：材質法與 EPD 實測各自的值，係數取兩者較低者
   * （WBCSD 2023 §5.1「most probable conservative」）。
   */
  materialBomKgCO2ePerKg?: number;
  referenceEpdKgCO2ePerKg?: number;
  basis?: "material_bom" | "reference_epd";
  sourceIds: SourceId[];
}

function unique<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function materialSourceIds(components: readonly BomComponent[]): SourceId[] {
  const ids: SourceId[] = [];
  for (const component of components) {
    if (component.material !== null) {
      ids.push(MATERIAL_FACTORS[component.material].sourceId);
    }
  }
  return ids;
}

function deriveProductionFactor(categoryId: CategoryId): ProductionFactor {
  const { method } = CATEGORIES[categoryId];
  switch (method.kind) {
    case "reference_products": {
      const components = method.products.reduce<BomComponent[]>(
        (acc, p) => acc.concat(p.components),
        [],
      );
      const materialBom = bomFactor(components);
      const referenceEpd = referenceEpdFactor(method.products);
      const useBom = materialBom <= referenceEpd;
      return {
        categoryId,
        kgCO2ePerKg: useBom ? materialBom : referenceEpd,
        method: method.kind,
        materialBomKgCO2ePerKg: materialBom,
        referenceEpdKgCO2ePerKg: referenceEpd,
        basis: useBom ? "material_bom" : "reference_epd",
        sourceIds: unique([
          ...method.products.map((p) => p.sourceId),
          ...materialSourceIds(components),
        ]),
      };
    }
    case "fixed_bom":
      return {
        categoryId,
        kgCO2ePerKg: bomFactor(method.components),
        method: method.kind,
        sourceIds: unique([
          ...(method.sourceId ? [method.sourceId] : []),
          ...materialSourceIds(method.components),
        ]),
      };
    case "product_factor": {
      const factor = PRODUCT_FACTORS[method.productFactorId];
      return {
        categoryId,
        kgCO2ePerKg: shortTonToKgFactor(factor.mtco2ePerShortTon),
        method: method.kind,
        sourceIds: [factor.sourceId],
      };
    }
    case "not_counted":
      return {
        categoryId,
        kgCO2ePerKg: null,
        method: method.kind,
        sourceIds: [],
      };
  }
}

const PRODUCTION_FACTORS = CATEGORY_IDS.reduce(
  (acc, id) => {
    acc[id] = deriveProductionFactor(id);
    return acc;
  },
  {} as Record<CategoryId, ProductionFactor>,
);

export function getProductionFactor(categoryId: CategoryId): ProductionFactor {
  return PRODUCTION_FACTORS[categoryId];
}

// ---------------------------------------------------------------------------
// 取代率
// ---------------------------------------------------------------------------

export interface SurveyCounts {
  /** 「如果沒拿到這件，你會買全新的同類品嗎？」 */
  yes: number;
  maybe: number;
  no: number;
}

export interface SurveyReplacementRate {
  sampleSize: number;
  rate: number | null;
  /** 樣本數達 MIN_SURVEY_SAMPLE 才可取代預設值 */
  usable: boolean;
}

/** Vaayu / eBay 作法：Yes 計 1、Maybe 計 0.5、No 計 0 */
export function replacementRateFromSurvey(
  counts: SurveyCounts,
  minSample: number = MIN_SURVEY_SAMPLE,
): SurveyReplacementRate {
  const values = [counts.yes, counts.maybe, counts.no];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) {
    throw new RangeError("Survey counts must be non-negative integers");
  }
  const sampleSize = counts.yes + counts.maybe + counts.no;
  if (sampleSize === 0) return { sampleSize, rate: null, usable: false };
  return {
    sampleSize,
    rate: (counts.yes + 0.5 * counts.maybe) / sampleSize,
    usable: sampleSize >= minSample,
  };
}

// ---------------------------------------------------------------------------
// 估算
// ---------------------------------------------------------------------------

export interface ItemInput {
  categoryId: CategoryId;
  quantity: number;
  /** 刊登者填的單件重量；未填時用類別預設值 */
  unitWeightKg?: number | null;
  /**
   * 傳入的重量是上架時帶入、未修改的類別預設值（org_post_details.weight_is_default）。
   * 用存下的重量計算（之後係數表改預設值不會改寫舊物品），但揭露時算「預設重量」
   */
  weightIsDefault?: boolean;
}

export type ItemStatus = "counted" | "category_not_counted" | "weight_missing";

export interface ItemEstimate {
  categoryId: CategoryId;
  quantity: number;
  status: ItemStatus;
  /** 總重（單件重量 × 件數）；沒有重量時為 null */
  weightKg: number | null;
  weightSource: "entered" | "category_default" | "missing";
  productionFactorKgCO2ePerKg: number | null;
  replacementRate: number;
  potentialKgCO2e: number;
  estimatedKgCO2e: number;
}

export interface EstimateOptions {
  /** 問卷實測的類別取代率（僅傳 usable 的值），未提供的類別用預設 0.5 */
  replacementRates?: Partial<Record<CategoryId, number>>;
}

function assertRate(rate: number): void {
  if (!(rate >= 0 && rate <= 1)) {
    throw new RangeError(`Replacement rate must be within [0, 1]: ${rate}`);
  }
}

export function estimateItem(
  input: ItemInput,
  options: EstimateOptions = {},
): ItemEstimate {
  const category = CATEGORIES[input.categoryId];
  if (!category) {
    throw new RangeError(`Unknown category: ${String(input.categoryId)}`);
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError(
      `Quantity must be a positive integer: ${input.quantity}`,
    );
  }
  const entered = input.unitWeightKg;
  if (
    entered !== undefined &&
    entered !== null &&
    !(Number.isFinite(entered) && entered > 0)
  ) {
    throw new RangeError(`Unit weight must be a positive number: ${entered}`);
  }

  const replacementRate =
    options.replacementRates?.[input.categoryId] ??
    DEFAULT_REPLACEMENT_RATE.value;
  assertRate(replacementRate);

  let unitWeightKg: number | null = null;
  let weightSource: ItemEstimate["weightSource"] = "missing";
  if (entered !== undefined && entered !== null) {
    unitWeightKg = entered;
    weightSource = input.weightIsDefault ? "category_default" : "entered";
  } else if (category.defaultWeight) {
    unitWeightKg = category.defaultWeight.kg;
    weightSource = "category_default";
  }
  const weightKg = unitWeightKg === null ? null : unitWeightKg * input.quantity;
  const factor = PRODUCTION_FACTORS[input.categoryId].kgCO2ePerKg;

  const base = {
    categoryId: input.categoryId,
    quantity: input.quantity,
    weightKg,
    weightSource,
    productionFactorKgCO2ePerKg: factor,
    replacementRate,
  };
  if (factor === null) {
    return {
      ...base,
      status: "category_not_counted",
      potentialKgCO2e: 0,
      estimatedKgCO2e: 0,
    };
  }
  if (weightKg === null) {
    return {
      ...base,
      status: "weight_missing",
      potentialKgCO2e: 0,
      estimatedKgCO2e: 0,
    };
  }
  const potentialKgCO2e = weightKg * factor;
  return {
    ...base,
    status: "counted",
    potentialKgCO2e,
    estimatedKgCO2e: potentialKgCO2e * replacementRate,
  };
}

export interface CategorySummary {
  categoryId: CategoryId;
  quantity: number;
  weightKg: number;
  potentialKgCO2e: number;
  estimatedKgCO2e: number;
}

export interface AvoidedEmissionsReport {
  factorTableVersion: string;
  itemCount: number;
  countedItemCount: number;
  /** 所有有重量的物品（含不計入類別），對應 E6-2「估算重量」 */
  totalWeightKg: number;
  /** 其中用類別預設值的重量，報表應揭露占比 */
  defaultWeightKg: number;
  /** 不計入類別或缺重量的件數 */
  uncountedQuantity: number;
  potentialKgCO2e: number;
  estimatedKgCO2e: number;
  byCategory: CategorySummary[];
  items: ItemEstimate[];
}

/** 組織報表：輸入為已完成交接的 Item（一次 Weave 只算一次，避免重複計算） */
export function estimateReport(
  inputs: readonly ItemInput[],
  options: EstimateOptions = {},
): AvoidedEmissionsReport {
  const items = inputs.map((input) => estimateItem(input, options));
  const byCategory = new Map<CategoryId, CategorySummary>();
  let totalWeightKg = 0;
  let defaultWeightKg = 0;
  let uncountedQuantity = 0;
  let potentialKgCO2e = 0;
  let estimatedKgCO2e = 0;

  for (const item of items) {
    const weight = item.weightKg ?? 0;
    totalWeightKg += weight;
    if (item.weightSource === "category_default") defaultWeightKg += weight;
    if (item.status !== "counted") uncountedQuantity += item.quantity;
    potentialKgCO2e += item.potentialKgCO2e;
    estimatedKgCO2e += item.estimatedKgCO2e;

    const summary = byCategory.get(item.categoryId) ?? {
      categoryId: item.categoryId,
      quantity: 0,
      weightKg: 0,
      potentialKgCO2e: 0,
      estimatedKgCO2e: 0,
    };
    summary.quantity += item.quantity;
    summary.weightKg += weight;
    summary.potentialKgCO2e += item.potentialKgCO2e;
    summary.estimatedKgCO2e += item.estimatedKgCO2e;
    byCategory.set(item.categoryId, summary);
  }

  return {
    factorTableVersion: FACTOR_TABLE_VERSION,
    itemCount: items.length,
    countedItemCount: items.filter((i) => i.status === "counted").length,
    totalWeightKg,
    defaultWeightKg,
    uncountedQuantity,
    potentialKgCO2e,
    estimatedKgCO2e,
    byCategory: CATEGORY_IDS.filter((id) => byCategory.has(id)).map(
      (id) => byCategory.get(id) as CategorySummary,
    ),
    items,
  };
}
