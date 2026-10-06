import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDriverRemarks, toLalamoveLanguage } from "@/utils/lalamove";

describe("toLalamoveLanguage", () => {
  it("maps zh-TW to the zh_TW market language", () => {
    assert.equal(toLalamoveLanguage("zh-TW"), "zh_TW");
  });

  it("maps en to the en_TW market language", () => {
    assert.equal(toLalamoveLanguage("en"), "en_TW");
  });
});

describe("buildDriverRemarks", () => {
  it("prefixes the floor/unit in Chinese and joins it with the note", () => {
    assert.equal(
      buildDriverRemarks("3樓之1", "請按電鈴"),
      "樓層門牌：3樓之1，請按電鈴",
    );
  });

  it("returns only the part that was filled in", () => {
    assert.equal(buildDriverRemarks("A棟", ""), "樓層門牌：A棟");
    assert.equal(buildDriverRemarks("", "Call me"), "Call me");
  });

  it("returns undefined when both are empty", () => {
    assert.equal(buildDriverRemarks("", ""), undefined);
  });
});
