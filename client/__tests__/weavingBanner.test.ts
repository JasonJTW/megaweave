import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weavingBanner } from "@/utils/weavingBanner";

describe("weavingBanner", () => {
  it("lets a receiver on a Share request the named item", () => {
    assert.deepEqual(
      weavingBanner({
        postType: "share",
        isPostAuthor: false,
        itemTitle: "Desk lamp",
        itemId: 7,
      }),
      { role: "request", itemTitle: "Desk lamp" },
    );
  });

  it("makes the Share or Commons author the one who gives", () => {
    for (const postType of ["share", "commons"]) {
      assert.equal(
        weavingBanner({
          postType,
          isPostAuthor: true,
          itemTitle: "Lamp",
          itemId: 7,
        }).role,
        "give",
      );
    }
  });

  it("makes the non-author on a Wish the one who offers, and the author the one who requests", () => {
    const wish = { postType: "wish", itemTitle: "Lamp", itemId: 7 };
    assert.equal(weavingBanner({ ...wish, isPostAuthor: false }).role, "offer");
    assert.equal(
      weavingBanner({ ...wish, isPostAuthor: true }).role,
      "request",
    );
  });

  it("has no role when the message predates post type metadata", () => {
    assert.equal(
      weavingBanner({
        postType: null,
        isPostAuthor: true,
        itemTitle: "Lamp",
        itemId: 7,
      }).role,
      null,
    );
  });

  it("covers the whole post when no single item is named", () => {
    const share = { postType: "share", isPostAuthor: false };
    for (const item of [
      { itemTitle: "", itemId: 7 },
      { itemTitle: "All", itemId: 7 },
      { itemTitle: "Lamp", itemId: null },
      { itemTitle: "Lamp", itemId: "ALL" },
    ]) {
      assert.equal(weavingBanner({ ...share, ...item }).itemTitle, null);
    }
  });

  it("trims the item title", () => {
    assert.equal(
      weavingBanner({
        postType: "share",
        isPostAuthor: false,
        itemTitle: " Lamp ",
        itemId: 7,
      }).itemTitle,
      "Lamp",
    );
  });
});
