import fs from "fs";
import path from "path";
import {
  CATEGORIES,
  CATEGORY_IDS,
  DEFAULT_REPLACEMENT_RATE,
  FACTOR_TABLE_VERSION,
  MATERIAL_FACTORS,
  MATERIAL_IDS,
  PRODUCT_FACTORS,
  PRODUCT_FACTOR_IDS,
  REFERENCE_PRODUCTS,
  SOURCES,
  UNU_WEIGHT_YEAR,
} from "./factorTable";
import {
  bomFactor,
  estimateItem,
  estimateReport,
  getProductionFactor,
  referenceEpdFactor,
  replacementRateFromSurvey,
  shortTonToKgFactor,
} from "./avoidedEmissions";

const DATA_DIR = path.resolve(__dirname, "../../../../docs/notes/data");
const MOENV_SNAPSHOT = path.join(DATA_DIR, "moenv-cfp-p-02-2026-11-08.json");
const UNU_WEIGHTS_SNAPSHOT = path.join(
  DATA_DIR,
  "unu-ewaste-guidelines-ed3-annex6-average-weights-2026-11-08.csv",
);

interface MoenvRecord {
  name: string;
  coe: string;
  unit: string;
  departmentname: string;
  announcementyear: string;
}

describe("factor table provenance", () => {
  it("cites MOENV records exactly as they appear in the committed snapshot", () => {
    const snapshot = JSON.parse(fs.readFileSync(MOENV_SNAPSHOT, "utf8")) as {
      recordCount: number;
      records: MoenvRecord[];
    };
    expect(snapshot.records).toHaveLength(snapshot.recordCount);

    for (const id of MATERIAL_IDS) {
      const { moenvRecord, kgCO2ePerKg } = MATERIAL_FACTORS[id];
      const matches = snapshot.records.filter(
        (r) =>
          r.name === moenvRecord.name &&
          r.announcementyear === moenvRecord.announcementYear,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].coe).toBe(moenvRecord.coe);
      expect(matches[0].unit).toBe(moenvRecord.unit);
      expect(matches[0].departmentname).toBe(moenvRecord.departmentName);
      expect(Number(matches[0].coe)).toBe(kgCO2ePerKg);
    }
  });

  it("takes UNU default weights from the committed Annex 6 snapshot", () => {
    const [header, ...rows] = fs
      .readFileSync(UNU_WEIGHTS_SNAPSHOT, "utf8")
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(","));
    const yearColumn = header.indexOf(UNU_WEIGHT_YEAR);
    expect(yearColumn).toBeGreaterThan(0);

    const unuCategories = CATEGORY_IDS.filter(
      (id) => CATEGORIES[id].defaultWeight?.unuKey,
    );
    expect(unuCategories).toHaveLength(6);
    for (const id of unuCategories) {
      const weight = CATEGORIES[id].defaultWeight!;
      const row = rows.find((r) => r[0] === weight.unuKey);
      expect(row).toBeDefined();
      expect(Number(row![yearColumn])).toBe(weight.kg);
      expect(weight.sourceId).toBe("unu-2026-ewaste");
    }
  });

  it("keeps the laptop default below the MOENV Acer laptop footprint (81 kgCO2e/unit)", () => {
    const laptop = estimateItem({ categoryId: "laptop_tablet", quantity: 1 });
    expect(laptop.weightSource).toBe("category_default");
    expect(laptop.potentialKgCO2e).toBeLessThan(81);
  });

  it("references only declared sources", () => {
    const sourceIds = Object.keys(SOURCES);
    for (const id of CATEGORY_IDS) {
      for (const sourceId of getProductionFactor(id).sourceIds) {
        expect(sourceIds).toContain(sourceId);
      }
      const weight = CATEGORIES[id].defaultWeight;
      if (weight) expect(sourceIds).toContain(weight.sourceId);
    }
    for (const id of PRODUCT_FACTOR_IDS) {
      expect(sourceIds).toContain(PRODUCT_FACTORS[id].sourceId);
    }
  });

  it("gives every counted category a factor and leaves only not_counted ones empty", () => {
    for (const id of CATEGORY_IDS) {
      const factor = getProductionFactor(id);
      if (CATEGORIES[id].method.kind === "not_counted") {
        expect(factor.kgCO2ePerKg).toBeNull();
      } else {
        expect(factor.kgCO2ePerKg).toBeGreaterThan(0);
      }
    }
  });
});

describe("factor derivation", () => {
  it("weights a BOM by amount and counts unmatched materials as zero", () => {
    expect(
      bomFactor([
        { label: "steel", material: "steel", amount: 3 },
        { label: "unknown", material: null, amount: 1 },
      ]),
    ).toBeCloseTo((3 * 2.5) / 4, 10);
  });

  it("normalises BOM shares that do not add up to 100 (WRAP sofa sums to 101%)", () => {
    const expected =
      (63 * 1.12 + 9 * 1.95 + 8 * 4.42 + 8 * 2.5 + 3 * 4.45) / 101;
    expect(getProductionFactor("upholstered_seating").kgCO2ePerKg).toBeCloseTo(
      expected,
      10,
    );
  });

  it("converts WARM MTCO2E/short ton to kgCO2e/kg", () => {
    expect(shortTonToKgFactor(1)).toBeCloseTo(1.1023113, 6);
    expect(getProductionFactor("desktop_computer").kgCO2ePerKg).toBeCloseTo(
      22.994,
      3,
    );
    expect(getProductionFactor("laptop_tablet").kgCO2ePerKg).toBeCloseTo(
      32.882,
      3,
    );
  });

  it("takes the lower of the material BOM and the reference EPD average", () => {
    const chair = getProductionFactor("office_chair");
    expect(chair.basis).toBe("material_bom");
    expect(chair.kgCO2ePerKg).toBeCloseTo(3.441, 3);
    expect(chair.referenceEpdKgCO2ePerKg).toBeCloseTo(
      (74.1 + 58.0 + 142 + 79.4 + 76.8 + 105.3 + 88.3 + 81.9 + 99.7) /
        (13.787 + 20.63 + 19.0 + 20.03 + 17.77 + 17.033 + 15.34 + 14.9 + 19.71),
      10,
    );
    // 九份參考產品的材質表加總要接近各自宣告的重量（抄錄錯誤的防呆）
    for (const product of REFERENCE_PRODUCTS.office_chair) {
      const bomMass = product.components.reduce((sum, c) => sum + c.amount, 0);
      expect(Math.abs(bomMass - product.declaredMassKg)).toBeLessThan(
        product.declaredMassKg * 0.01,
      );
    }

    const desk = getProductionFactor("desk_table");
    expect(desk.basis).toBe("reference_epd");
    expect(desk.materialBomKgCO2ePerKg).toBeCloseTo(1.971, 3);
    expect(desk.kgCO2ePerKg).toBeCloseTo(60.0 / 37.4, 10);

    const storage = getProductionFactor("steel_storage");
    expect(storage.basis).toBe("material_bom");
    expect(storage.kgCO2ePerKg).toBeLessThan(storage.referenceEpdKgCO2ePerKg!);
  });

  it("rejects an empty reference set", () => {
    expect(() => referenceEpdFactor([])).toThrow(RangeError);
  });
});

describe("replacementRateFromSurvey", () => {
  it("scores yes as 1, maybe as 0.5 and no as 0", () => {
    expect(replacementRateFromSurvey({ yes: 50, maybe: 40, no: 30 })).toEqual({
      sampleSize: 120,
      rate: (50 + 20) / 120,
      usable: true,
    });
  });

  it("is not usable below the minimum sample", () => {
    const result = replacementRateFromSurvey({ yes: 10, maybe: 0, no: 0 });
    expect(result.rate).toBe(1);
    expect(result.usable).toBe(false);
  });

  it("returns no rate without responses", () => {
    expect(replacementRateFromSurvey({ yes: 0, maybe: 0, no: 0 })).toEqual({
      sampleSize: 0,
      rate: null,
      usable: false,
    });
  });

  it("rejects non-integer counts", () => {
    expect(() =>
      replacementRateFromSurvey({ yes: 1.5, maybe: 0, no: 0 }),
    ).toThrow(RangeError);
  });
});

describe("estimateItem", () => {
  it("multiplies entered weight, quantity, factor and replacement rate", () => {
    const result = estimateItem({
      categoryId: "steel_storage",
      quantity: 2,
      unitWeightKg: 30,
    });
    const factor = getProductionFactor("steel_storage").kgCO2ePerKg!;
    expect(result.status).toBe("counted");
    expect(result.weightSource).toBe("entered");
    expect(result.weightKg).toBe(60);
    expect(result.potentialKgCO2e).toBeCloseTo(60 * factor, 10);
    expect(result.estimatedKgCO2e).toBeCloseTo(
      60 * factor * DEFAULT_REPLACEMENT_RATE.value,
      10,
    );
  });

  it("falls back to the category default weight", () => {
    const result = estimateItem({ categoryId: "office_chair", quantity: 1 });
    expect(result.weightSource).toBe("category_default");
    expect(result.weightKg).toBe(13.8);
  });

  it("keeps a stored default weight as category_default even after the table changes", () => {
    //* 上架時帶入、未修改的預設值：用當時存下的重量，但揭露時仍算「預設重量」
    const result = estimateItem({
      categoryId: "office_chair",
      quantity: 2,
      unitWeightKg: 12,
      weightIsDefault: true,
    });
    expect(result.weightSource).toBe("category_default");
    expect(result.weightKg).toBe(24);
    const report = estimateReport([
      { categoryId: "office_chair", quantity: 2, unitWeightKg: 12, weightIsDefault: true },
      { categoryId: "office_chair", quantity: 1, unitWeightKg: 20, weightIsDefault: false },
    ]);
    expect(report.defaultWeightKg).toBe(24);
    expect(report.totalWeightKg).toBe(44);
  });

  it("flags a category without a default weight when none is entered", () => {
    const result = estimateItem({ categoryId: "plastic_goods", quantity: 1 });
    expect(result.status).toBe("weight_missing");
    expect(result.weightKg).toBeNull();
    expect(result.potentialKgCO2e).toBe(0);
  });

  it("keeps the weight of a not-counted category but no emissions", () => {
    const result = estimateItem({
      categoryId: "small_appliance",
      quantity: 1,
      unitWeightKg: 4,
    });
    expect(result.status).toBe("category_not_counted");
    expect(result.weightKg).toBe(4);
    expect(result.estimatedKgCO2e).toBe(0);
  });

  it("uses a surveyed replacement rate when given", () => {
    const result = estimateItem(
      { categoryId: "display", quantity: 1, unitWeightKg: 5 },
      { replacementRates: { display: 0.6 } },
    );
    expect(result.replacementRate).toBe(0.6);
    expect(result.estimatedKgCO2e).toBeCloseTo(
      result.potentialKgCO2e * 0.6,
      10,
    );
  });

  it.each([
    [{ categoryId: "display" as const, quantity: 0 }],
    [{ categoryId: "display" as const, quantity: 1.5 }],
    [{ categoryId: "display" as const, quantity: 1, unitWeightKg: 0 }],
    [{ categoryId: "display" as const, quantity: 1, unitWeightKg: Number.NaN }],
  ])("rejects invalid input %j", (input) => {
    expect(() => estimateItem(input)).toThrow(RangeError);
  });

  it("rejects a replacement rate outside [0, 1]", () => {
    expect(() =>
      estimateItem(
        { categoryId: "display", quantity: 1 },
        { replacementRates: { display: 1.2 } },
      ),
    ).toThrow(RangeError);
  });
});

describe("estimateReport", () => {
  it("sums items, tracks defaulted weight and uncounted quantity", () => {
    const report = estimateReport([
      { categoryId: "office_chair", quantity: 3 },
      { categoryId: "office_chair", quantity: 1, unitWeightKg: 20 },
      { categoryId: "laptop_tablet", quantity: 2, unitWeightKg: 1.5 },
      { categoryId: "other", quantity: 5, unitWeightKg: 1 },
    ]);
    const chair = getProductionFactor("office_chair").kgCO2ePerKg!;
    const laptop = getProductionFactor("laptop_tablet").kgCO2ePerKg!;
    const potential = (3 * 13.8 + 20) * chair + 3 * laptop;

    expect(report.factorTableVersion).toBe(FACTOR_TABLE_VERSION);
    expect(report.itemCount).toBe(4);
    expect(report.countedItemCount).toBe(3);
    expect(report.totalWeightKg).toBeCloseTo(3 * 13.8 + 20 + 3 + 5, 10);
    expect(report.defaultWeightKg).toBeCloseTo(3 * 13.8, 10);
    expect(report.uncountedQuantity).toBe(5);
    expect(report.potentialKgCO2e).toBeCloseTo(potential, 10);
    expect(report.estimatedKgCO2e).toBeCloseTo(potential * 0.5, 10);
    expect(report.byCategory.map((c) => c.categoryId)).toEqual([
      "office_chair",
      "laptop_tablet",
      "other",
    ]);
    expect(report.byCategory[0].quantity).toBe(4);
  });

  it("returns zeros for an empty organisation", () => {
    const report = estimateReport([]);
    expect(report.potentialKgCO2e).toBe(0);
    expect(report.byCategory).toEqual([]);
  });
});
