import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveReferenceName } from "../i18n/referenceNames";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";

const catalog = (entries: Record<string, string>) => ({
  has: (key: string) => key in entries,
  get: (key: string) => entries[key],
});

describe("resolveReferenceName", () => {
  const categories = catalog({ "7": "居家生活" });

  it("prefers the translated name", () => {
    assert.equal(
      resolveReferenceName(categories, "7", "Home & Living"),
      "居家生活",
    );
  });

  it("falls back to name_en when the catalog has no entry for the id", () => {
    assert.equal(resolveReferenceName(categories, "99", "Brand New"), "Brand New");
  });

  it("returns an empty string when neither a translation nor a fallback exists", () => {
    assert.equal(resolveReferenceName(categories, "99", undefined), "");
    assert.equal(resolveReferenceName(categories, "99", "  "), "");
  });

  it("has nothing to look up without a key", () => {
    assert.equal(resolveReferenceName(categories, undefined, "Others"), "Others");
  });
});

// Reference data is seeded, not user-generated: a row added to the seed without a
// translation would silently show English to Chinese readers via the name_en fallback.
const SEED_SQL = new URL("../../server/db/reference-data.sql", import.meta.url);

function seededIds(table: string): string[] {
  const sql = readFileSync(SEED_SQL, "utf8");
  const statements = sql.matchAll(
    new RegExp(`INSERT INTO \`${table}\` VALUES (.*);`, "g"),
  );
  // One statement can carry several rows: VALUES (1,...),(2,...)
  return [...statements].flatMap(([, rows]) =>
    [...rows.matchAll(/(?:^|\),)\((\d+),/g)].map(([, id]) => id),
  );
}

describe("reference data translations", () => {
  it("names every seeded category in both locales", () => {
    const ids = seededIds("categories");
    assert.ok(ids.length > 0, "found no seeded categories");
    assert.deepEqual(Object.keys(zhTW.Categories).sort(), ids.slice().sort());
    assert.deepEqual(Object.keys(en.Categories).sort(), ids.slice().sort());
  });

  it("names every seeded condition level in both locales", () => {
    // conditions are keyed by level, which the seed keeps equal to the row id
    const levels = seededIds("conditions");
    assert.ok(levels.length > 0, "found no seeded conditions");
    assert.deepEqual(Object.keys(zhTW.Conditions).sort(), levels.slice().sort());
    assert.deepEqual(Object.keys(en.Conditions).sort(), levels.slice().sort());
  });
});
