// server/src/services/orgItemCategories.ts
// 組織物品類別（#136）。類別、預設重量與來源只有一份：避免排放量係數表
// （avoidedEmissions/factorTable.ts，ADR 0005）。這裡只加兩件事：
// - 上架表單要的公開資訊（名稱、例子、預設重量與其出處）
// - 物品升到 Public 時落在哪個公開分類（posts.category_id → reference-data.sql 的 categories）

import {
  CATEGORIES,
  CATEGORY_IDS,
  CategoryId,
  FACTOR_TABLE_VERSION,
  SOURCES,
} from "./avoidedEmissions/factorTable";

export const ORG_ITEM_CATEGORY_IDS = CATEGORY_IDS;
export type OrgItemCategoryId = CategoryId;

//* categories.id（server/db/reference-data.sql）
const HOME_LIVING = 7;
const ELECTRONICS = 9;
const BOOKS_CRAFTS = 5;
const FASHION = 6;
const APPLIANCES = 1;
const OTHERS = 4;

const PUBLIC_CATEGORY_ID: Record<CategoryId, number> = {
  office_chair: HOME_LIVING,
  desk_table: HOME_LIVING,
  wood_storage: HOME_LIVING,
  steel_storage: HOME_LIVING,
  upholstered_seating: HOME_LIVING,
  desktop_computer: ELECTRONICS,
  laptop_tablet: ELECTRONICS,
  mobile_phone: ELECTRONICS,
  display: ELECTRONICS,
  printer: ELECTRONICS,
  it_peripheral: ELECTRONICS,
  plastic_goods: HOME_LIVING,
  books_paper: BOOKS_CRAFTS,
  textiles: FASHION,
  small_appliance: APPLIANCES,
  other: OTHERS,
};

/** 組織物品類別對應的公開分類（posts.category_id） */
export function publicCategoryIdOf(category: CategoryId): number {
  return PUBLIC_CATEGORY_ID[category];
}

/** 類別預設單件重量（kg）；null 表示沒有可引用的平均重量，表單必填 */
export function defaultUnitWeightKg(category: CategoryId): number | null {
  return CATEGORIES[category].defaultWeight?.kg ?? null;
}

export interface OrgItemCategoryOption {
  id: CategoryId;
  name: string;
  examples: string;
  defaultWeightKg: number | null;
  defaultWeightSource: {
    title: string;
    publisher: string;
    year: number;
    url: string;
    locator: string;
  } | null;
}

/** 上架表單的類別選單（含預設重量的出處，ADR 0005） */
export function listOrgItemCategories(): {
  categories: OrgItemCategoryOption[];
  factorTableVersion: string;
} {
  return {
    factorTableVersion: FACTOR_TABLE_VERSION,
    categories: CATEGORY_IDS.map((id) => {
      const profile = CATEGORIES[id];
      const weight = profile.defaultWeight;
      const source = weight ? SOURCES[weight.sourceId] : null;
      return {
        id,
        name: profile.nameZh,
        examples: profile.examplesZh,
        defaultWeightKg: weight?.kg ?? null,
        defaultWeightSource:
          weight && source
            ? {
                title: source.title,
                publisher: source.publisher,
                year: source.year,
                url: source.url,
                locator: weight.locator,
              }
            : null,
      };
    }),
  };
}
