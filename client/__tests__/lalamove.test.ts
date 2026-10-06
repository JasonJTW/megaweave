import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDriverRemarks } from "@/utils/lalamove";

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
