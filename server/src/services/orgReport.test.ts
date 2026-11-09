/**
 * 組織報表（#143，PRD 0001 E6-1、E6-2；ADR 0005）
 * buildOrgReport 是純函式：輸入流轉紀錄（物品、已完成的 Weave、層級事件），輸出報表數字。
 * 期望值都是手算的例子，不是用同樣的程式重算。
 */
import { buildOrgReport, ReportInput } from "./orgReport";
import { getProductionFactor } from "./avoidedEmissions/avoidedEmissions";
import { FACTOR_TABLE_VERSION } from "./avoidedEmissions/factorTable";

const GA = { id: 1, name: "總務部" };
const IT = { id: 2, name: "資訊部" };

const t = (iso: string) => new Date(`2026-11-${iso}Z`);

function input(partial: Partial<ReportInput>): ReportInput {
  return { units: [GA, IT], posts: [], weaves: [], tierEvents: [], ...partial };
}

function post(id: number, over: Partial<ReportInput["posts"][number]> = {}) {
  return {
    postId: id,
    unitId: GA.id,
    orgCategory: "steel_storage" as const,
    quantity: 4,
    unitWeightKg: 30,
    weightIsDefault: false,
    estimatedValueTwd: null,
    onShelf: true,
    stockQuantity: null,
    ...over,
  };
}

describe("buildOrgReport: circulation and tiers (E6-1)", () => {
  it("counts each completed Weave once and assigns it to the tier at request time", () => {
    const report = buildOrgReport(
      input({
        posts: [post(10, { quantity: 4 }), post(11, { quantity: 6 })],
        tierEvents: [
          //* 11 在 05 日升到 Members、07 日升到 Public
          { postId: 11, toTier: "members", createdAt: t("05T00:00:00") },
          { postId: 11, toTier: "public", createdAt: t("07T00:00:00") },
        ],
        weaves: [
          //* 10：Internal 時申請 1 件，後來 IT 代表單位申請 2 件
          { weaveId: 1, postId: 10, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
          { weaveId: 2, postId: 10, quantity: 2, createdAt: t("03T00:00:00"), receiverUnitId: IT.id },
          //* 11：Internal 時申請（完成時已在 Members，仍算 Internal）、Members 時、Public 時各一筆
          { weaveId: 3, postId: 11, quantity: 1, createdAt: t("04T00:00:00"), receiverUnitId: IT.id },
          { weaveId: 4, postId: 11, quantity: 2, createdAt: t("06T00:00:00"), receiverUnitId: null },
          { weaveId: 5, postId: 11, quantity: 1, createdAt: t("08T00:00:00"), receiverUnitId: null },
        ],
      }),
    );

    expect(report.listing).toEqual({ itemCount: 2, quantity: 10 });
    expect(report.circulation).toEqual({ weaveCount: 5, quantity: 7, rate: 0.7 });
    expect(report.tiers).toEqual([
      { tier: "internal", reachedItemCount: 2, weaveCount: 3, quantity: 4, rate: 0.4 },
      { tier: "members", reachedItemCount: 1, weaveCount: 1, quantity: 2, rate: 0.2 },
      { tier: "public", reachedItemCount: 1, weaveCount: 1, quantity: 1, rate: 0.1 },
    ]);
  });

  it("uses the tier an item went back to after a demotion", () => {
    const report = buildOrgReport(
      input({
        posts: [post(10, { quantity: 2 })],
        tierEvents: [
          { postId: 10, toTier: "members", createdAt: t("02T00:00:00") },
          { postId: 10, toTier: "internal", createdAt: t("03T00:00:00") },
        ],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 1, createdAt: t("04T00:00:00"), receiverUnitId: IT.id },
        ],
      }),
    );
    expect(report.tiers.map((x) => [x.tier, x.quantity, x.reachedItemCount])).toEqual([
      ["internal", 1, 1],
      ["members", 0, 1],
      ["public", 0, 0],
    ]);
  });

  it("returns null rates when nothing is listed", () => {
    const report = buildOrgReport(input({}));
    expect(report.circulation).toEqual({ weaveCount: 0, quantity: 0, rate: null });
    expect(report.tiers.every((x) => x.rate === null)).toBe(true);
  });

  it("breaks the flow down by giving and receiving unit", () => {
    const report = buildOrgReport(
      input({
        posts: [post(10, { quantity: 4 }), post(20, { unitId: IT.id, quantity: 1 })],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 3, createdAt: t("02T00:00:00"), receiverUnitId: IT.id },
          { weaveId: 2, postId: 20, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
        ],
      }),
    );
    expect(report.units).toEqual([
      { unit: GA, listedItemCount: 1, listedQuantity: 4, givenQuantity: 3, receivedQuantity: 0, givenEstimatedKgCO2e: expect.any(Number) },
      { unit: IT, listedItemCount: 1, listedQuantity: 1, givenQuantity: 1, receivedQuantity: 3, givenEstimatedKgCO2e: expect.any(Number) },
    ]);
  });
});

describe("buildOrgReport: weight, value and avoided emissions (E6-2)", () => {
  it("estimates only completed Weaves with the model's weight × factor × R", () => {
    const steel = getProductionFactor("steel_storage").kgCO2ePerKg!;
    const chair = getProductionFactor("office_chair").kgCO2ePerKg!;
    const report = buildOrgReport(
      input({
        posts: [
          post(10, { orgCategory: "steel_storage", quantity: 4, unitWeightKg: 30, estimatedValueTwd: 1000 }),
          post(11, { orgCategory: "office_chair", quantity: 2, unitWeightKg: 13.8, weightIsDefault: true }),
          post(12, { orgCategory: "small_appliance", quantity: 1, unitWeightKg: 3 }),
          //* 沒有任何完成的 Weave：不計入
          post(13, { orgCategory: "steel_storage", quantity: 9, unitWeightKg: 50 }),
        ],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 2, createdAt: t("02T00:00:00"), receiverUnitId: null },
          { weaveId: 2, postId: 11, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
          { weaveId: 3, postId: 12, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
        ],
      }),
    );
    const potential = 60 * steel + 13.8 * chair;
    const e = report.emissions;
    expect(e.factorTableVersion).toBe(FACTOR_TABLE_VERSION);
    expect(e.totalWeightKg).toBeCloseTo(60 + 13.8 + 3, 10);
    expect(e.defaultWeightKg).toBeCloseTo(13.8, 10);
    expect(e.defaultWeightShare).toBeCloseTo(13.8 / 76.8, 10);
    expect(e.potentialKgCO2e).toBeCloseTo(potential, 10);
    expect(e.estimatedKgCO2e).toBeCloseTo(potential * 0.5, 10);
    expect(e.replacementRate).toMatchObject({ value: 0.5, status: "assumed" });
    expect(e.countedQuantity).toBe(3);
    expect(e.uncountedQuantity).toBe(1);
    expect(e.byCategory.map((c) => [c.categoryId, c.quantity])).toEqual([
      ["office_chair", 1],
      ["steel_storage", 2],
      ["small_appliance", 1],
    ]);
    //* 估算價值 = 單件估算價值 × 完成件數；沒填的件數另計
    expect(report.value).toEqual({ estimatedValueTwd: 2000, valuedQuantity: 2, unvaluedQuantity: 2 });
    expect(report.units[0].givenEstimatedKgCO2e).toBeCloseTo(potential * 0.5, 10);
  });

  it("counts a completed Weave on an item without org details as uncounted", () => {
    const report = buildOrgReport(
      input({
        posts: [post(10, { orgCategory: null, quantity: null, unitWeightKg: null, weightIsDefault: null })],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
        ],
      }),
    );
    expect(report.listing).toEqual({ itemCount: 1, quantity: 1 });
    expect(report.emissions.uncountedQuantity).toBe(1);
    expect(report.emissions.countedQuantity).toBe(0);
    expect(report.emissions.defaultWeightShare).toBeNull();
  });

  it("estimates the unrealized figure from what is still on the shelf, without adding it to the total", () => {
    const steel = getProductionFactor("steel_storage").kgCO2ePerKg!;
    const report = buildOrgReport(
      input({
        posts: [
          //* 4 件交出 1 件：剩 3 件 × 30 kg
          post(10, { quantity: 4, unitWeightKg: 30 }),
          //* 全部交出：不算
          post(11, { quantity: 2, unitWeightKg: 30 }),
          //* 已停用或下架：不算
          post(12, { quantity: 5, unitWeightKg: 30, onShelf: false }),
          //* 類別無係數：算件數、列為不計入
          post(13, { orgCategory: "small_appliance", quantity: 2, unitWeightKg: 3 }),
          //* 沒有物品資料的舊貼文：當 1 件、不計入
          post(14, { orgCategory: null, quantity: null, unitWeightKg: null, weightIsDefault: null }),
        ],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
          { weaveId: 2, postId: 11, quantity: 2, createdAt: t("02T00:00:00"), receiverUnitId: null },
        ],
      }),
    );
    const e = report.emissions;
    expect(e.unrealized.quantity).toBe(3 + 2 + 1);
    expect(e.unrealized.uncountedQuantity).toBe(2 + 1);
    expect(e.unrealized.estimatedKgCO2e).toBeCloseTo(90 * steel * 0.5, 10);
    //* 已實現的數字只有完成的 3 件
    expect(e.estimatedKgCO2e).toBeCloseTo(90 * steel * 0.5, 10);
  });

  it("takes the smaller of the live stock and listed minus handed over", () => {
    const steel = getProductionFactor("steel_storage").kgCO2ePerKg!;
    const report = buildOrgReport(
      input({
        posts: [
          //* 庫存比較少：剩 2 件
          post(10, { quantity: 4, unitWeightKg: 30, stockQuantity: 2 }),
          //* 舊的「整篇貼文」Weave 沒扣庫存：庫存還是 3，但已交出 1 件，剩 2 件
          post(11, { quantity: 3, unitWeightKg: 30, stockQuantity: 3 }),
        ],
        weaves: [
          { weaveId: 1, postId: 10, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
          { weaveId: 2, postId: 11, quantity: 1, createdAt: t("02T00:00:00"), receiverUnitId: null },
        ],
      }),
    );
    expect(report.emissions.unrealized.quantity).toBe(4);
    expect(report.emissions.unrealized.estimatedKgCO2e).toBeCloseTo(120 * steel * 0.5, 10);
  });

  it("lists every category factor with its cited sources", () => {
    const report = buildOrgReport(input({}));
    const chair = report.factors.find((f) => f.categoryId === "office_chair")!;
    expect(chair.kgCO2ePerKg).toBe(getProductionFactor("office_chair").kgCO2ePerKg);
    expect(chair.sources.length).toBeGreaterThan(0);
    expect(chair.sources[0]).toEqual(
      expect.objectContaining({ title: expect.any(String), url: expect.stringMatching(/^https:/) }),
    );
    const other = report.factors.find((f) => f.categoryId === "other")!;
    expect(other.kgCO2ePerKg).toBeNull();
    expect(other.sources).toEqual([]);
  });
});
