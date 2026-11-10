import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "next-intl";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import {
  quantityCellText,
  shownQuantity,
  type ManageTranslator,
} from "../lib/orgQuantity";

// 數量格與組織頁卡片：remainingQuantity 是還能領的數量，quantity 是上架登記的總數

const tZh = createTranslator({
  locale: "zh-TW",
  messages: zhTW,
  namespace: "Org.manage",
}) as ManageTranslator;
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "Org.manage",
}) as ManageTranslator;

const chair = { quantity: 5, remainingQuantity: 5, unitWeightKg: 13.8 };

describe("quantityCellText", () => {
  it("shows the plain count when nothing is taken yet, not '5 left'", () => {
    assert.deepEqual(quantityCellText(chair, tZh), {
      main: "5 件",
      muted: false,
      detail: "每件 13.8 公斤",
    });
    assert.deepEqual(quantityCellText(chair, tEn), {
      main: "5 items",
      muted: false,
      detail: "13.8 kg each",
    });
  });

  it("shows what is left over the listed total when some are taken", () => {
    const partly = { ...chair, remainingQuantity: 2 };
    assert.deepEqual(quantityCellText(partly, tZh), {
      main: "剩 2 件",
      muted: false,
      detail: "共 5 件 · 每件 13.8 公斤",
    });
    assert.deepEqual(quantityCellText(partly, tEn), {
      main: "2 left",
      muted: false,
      detail: "of 5 · 13.8 kg each",
    });
  });

  it("shows 'All taken', muted, when nothing is left", () => {
    const gone = { ...chair, quantity: 4, remainingQuantity: 0 };
    assert.deepEqual(quantityCellText(gone, tZh), {
      main: "已領完",
      muted: true,
      detail: "共 4 件 · 每件 13.8 公斤",
    });
    assert.equal(quantityCellText(gone, tEn).main, "All taken");
  });

  it("shows no count when neither quantity is known", () => {
    assert.deepEqual(
      quantityCellText(
        { quantity: null, remainingQuantity: null, unitWeightKg: 13.8 },
        tZh,
      ),
      { main: null, muted: false, detail: "每件 13.8 公斤" },
    );
  });

  it("leaves out the weight when it is unknown", () => {
    assert.deepEqual(
      quantityCellText(
        { ...chair, remainingQuantity: 2, unitWeightKg: null },
        tZh,
      ),
      { main: "剩 2 件", muted: false, detail: "共 5 件" },
    );
    assert.deepEqual(quantityCellText({ ...chair, unitWeightKg: null }, tZh), {
      main: "5 件",
      muted: false,
      detail: null,
    });
  });

  it("falls back to the listed count for an item without stock rows", () => {
    assert.equal(
      quantityCellText({ ...chair, quantity: 3, remainingQuantity: null }, tZh)
        .main,
      "3 件",
    );
  });
});

describe("shownQuantity (org page card)", () => {
  it("prefers what is left over the listed count", () => {
    assert.equal(shownQuantity({ quantity: 5, remainingQuantity: 2 }), 2);
    assert.equal(shownQuantity({ quantity: 5, remainingQuantity: 0 }), 0);
  });

  it("falls back to the listed count, or null when neither is known", () => {
    assert.equal(shownQuantity({ quantity: 3, remainingQuantity: null }), 3);
    assert.equal(
      shownQuantity({ quantity: null, remainingQuantity: null }),
      null,
    );
  });
});
