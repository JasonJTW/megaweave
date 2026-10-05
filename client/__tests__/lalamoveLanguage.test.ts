import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toLalamoveLanguage } from "@/utils/lalamove";
import { routing } from "@/i18n/routing";

describe("toLalamoveLanguage", () => {
  it("maps zh-TW to the zh_TW market language", () => {
    assert.equal(toLalamoveLanguage("zh-TW"), "zh_TW");
  });

  it("maps en to the en_TW market language", () => {
    assert.equal(toLalamoveLanguage("en"), "en_TW");
  });

  it("covers every configured locale", () => {
    for (const locale of routing.locales) {
      assert.match(toLalamoveLanguage(locale), /^[a-z]{2}_TW$/);
    }
  });
});
