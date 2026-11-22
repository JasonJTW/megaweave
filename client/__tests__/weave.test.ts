import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { draftRole, isWeaveDependentKey, weaveKey } from "@/lib/weave";

describe("isWeaveDependentKey", () => {
  const matches = isWeaveDependentKey(7);

  it("accepts the weave itself, the me page and every weave list", () => {
    assert.equal(matches(weaveKey(7)), true);
    assert.equal(matches("/api/me"), true);
    assert.equal(matches("/api/weaves"), true);
    assert.equal(matches("/api/weaves?postId=3&status=approved"), true);
  });

  it("rejects other weaves, other resources and non-string keys", () => {
    assert.equal(matches(weaveKey(70)), false);
    assert.equal(matches("/api/weaves/acting-units?postId=3"), false);
    assert.equal(matches("/api/messages/conversations"), false);
    assert.equal(matches(["tuple"]), false);
  });
});

describe("draftRole", () => {
  it("makes the Post Author the Giver on a Share or Commons and the Receiver on a Wish (ADR 0001)", () => {
    assert.equal(draftRole("share", true), "giver");
    assert.equal(draftRole("share", false), "receiver");
    assert.equal(draftRole("commons", true), "giver");
    assert.equal(draftRole("wish", true), "receiver");
    assert.equal(draftRole("wish", false), "giver");
  });
});
