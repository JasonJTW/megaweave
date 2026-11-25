import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  draftFromListing,
  listingPayload,
  missingListingFields,
  pickedLocationFrom,
  type PublicListing,
  splitTags,
} from "../lib/publicListing";

// 組織物品升到 Public 前，Org Admin 在確認框補上的公開資訊（地點、到期日、分類必填，標籤選填）

// Instants pinned in Taipei time (UTC+8), so the tests pass on any machine clock
const NOW = new Date("2026-11-10T15:00:00+08:00");

const SAVED: PublicListing = {
  categoryId: 3,
  tags: "螢幕, 辦公設備",
  expiresAt: "2026-12-01T15:59:59.999Z",
  location: {
    placeId: "place-101",
    name: "台北101",
    url: null,
    fullAddress: "110台北市信義區信義路五段7號",
    province: "台北市",
    city: "信義區",
    route: "信義路五段",
    zipCode: "110",
    lat: 25.03,
    lng: 121.56,
  },
};

const EMPTY: PublicListing = {
  categoryId: 3,
  tags: null,
  expiresAt: null,
  location: null,
};

describe("the public listing an Org Admin fills in before making an item public", () => {
  it("prefills what was saved before and sends it back unchanged", () => {
    const draft = draftFromListing(SAVED);

    assert.equal(draft.locationText, SAVED.location!.fullAddress);
    assert.deepEqual(draft.tags, ["螢幕", "辦公設備"]);
    assert.deepEqual(listingPayload(draft, NOW), {
      categoryId: 3,
      tags: "螢幕, 辦公設備",
      expiresAt: SAVED.expiresAt,
      location: {
        place_id: "place-101",
        full_address: SAVED.location!.fullAddress,
        name: "台北101",
        url: null,
        province: "台北市",
        city: "信義區",
        route: "信義路五段",
        zip_code: "110",
        lat: 25.03,
        lng: 121.56,
      },
    });
  });

  it("asks for a location and an expiry date on a freshly listed org item", () => {
    const draft = draftFromListing(EMPTY);
    assert.deepEqual(missingListingFields(draft, NOW), [
      "location",
      "expiresOn",
    ]);
    assert.equal(listingPayload(draft, NOW), null);
  });

  it("treats typed text without a picked suggestion as no location", () => {
    const draft = { ...draftFromListing(EMPTY), locationText: "台北市信義區" };
    assert.ok(missingListingFields(draft, NOW).includes("location"));
    assert.equal(
      pickedLocationFrom({
        full_address: "台北市信義區",
        province: "",
        city: "",
        route: "",
        zip: "",
        zip_code: "",
      }),
      null,
    );
  });

  it("accepts today as the expiry date, which lasts until the end of the day", () => {
    // What the calendar hands back for 10 Nov: Taipei midnight
    const today = new Date("2026-11-10T00:00:00+08:00");
    const draft = { ...draftFromListing(SAVED), expiresOn: today };
    assert.deepEqual(missingListingFields(draft, NOW), []);
    assert.equal(
      listingPayload(draft, NOW)?.expiresAt,
      "2026-11-10T15:59:59.999Z",
    );
  });

  it("refuses an expiry date that already passed", () => {
    const draft = {
      ...draftFromListing(SAVED),
      expiresOn: new Date("2026-11-09T00:00:00+08:00"),
    };
    assert.deepEqual(missingListingFields(draft, NOW), ["expiresOn"]);
  });

  it("asks for a category when none is set", () => {
    const draft = { ...draftFromListing(SAVED), categoryId: null };
    assert.deepEqual(missingListingFields(draft, NOW), ["categoryId"]);
  });

  it("keeps tags optional, like a regular post", () => {
    const draft = { ...draftFromListing(SAVED), tags: [] };
    assert.equal(listingPayload(draft, NOW)?.tags, null);
  });

  it("drops blanks, hashes and duplicates from saved tags", () => {
    assert.deepEqual(splitTags(" #螢幕, ,辦公設備,螢幕 "), [
      "螢幕",
      "辦公設備",
    ]);
  });
});
