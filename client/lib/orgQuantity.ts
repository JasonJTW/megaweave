//* 組織物品的數量要怎麼顯示：remainingQuantity 是還能領的數量（交織核准時預留、完成時扣減，
//* 已預留的不算），
//* quantity 是上架登記的總數（報表用，不會變）。純函式，元件只負責排版

interface QuantityFields {
  quantity: number | null;
  remainingQuantity: number | null;
}

/** 組織頁卡片上的件數：有剩餘數量就用它，舊資料沒有庫存列時退回登記數量 */
export function shownQuantity(post: QuantityFields): number | null {
  return post.remainingQuantity ?? post.quantity;
}

/** `Org.manage` 命名空間的翻譯函式（next-intl 的 t） */
export type ManageTranslator = (
  key: "pieces" | "remaining" | "listedTotal" | "allTaken" | "perPieceKg",
  values?: Record<string, number>,
) => string;

export interface QuantityCellText {
  /** 大字；null 表示沒有數量可顯示（顯示「—」） */
  main: string | null;
  /** 大字是否用灰色（已領完） */
  muted: boolean;
  /** 小字：共幾件與每件重量，以「 · 」相接；兩者都沒有時為 null */
  detail: string | null;
}

/**
 * 物品管理表的數量格。大字是還能領的數量，小字是上架總數與每件重量：
 * - 剩餘與總數相同（還沒人領）：「5 件」，不寫「剩 5」
 * - 部分領走：「剩 2 件」／「共 5 件」
 * - 領完：「已領完」（灰）／「共 4 件」
 */
export function quantityCellText(
  item: QuantityFields & { unitWeightKg: number | null },
  t: ManageTranslator,
): QuantityCellText {
  const { quantity, remainingQuantity: remaining } = item;
  const perPiece =
    item.unitWeightKg !== null
      ? t("perPieceKg", { kg: item.unitWeightKg })
      : null;

  let main: string | null;
  let muted = false;
  let total: string | null = null;
  if (remaining === null || quantity === null || remaining === quantity) {
    const shown = remaining ?? quantity;
    main = shown === null ? null : t("pieces", { count: shown });
  } else if (remaining === 0) {
    main = t("allTaken");
    muted = true;
    total = t("listedTotal", { count: quantity });
  } else {
    main = t("remaining", { count: remaining });
    total = t("listedTotal", { count: quantity });
  }

  const detail = [total, perPiece].filter(Boolean).join(" · ");
  return { main, muted, detail: detail || null };
}
