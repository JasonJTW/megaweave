import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasPendingWeaveForPost,
  type WeaveItemCheck,
} from "@/utils/weaveGuard";

describe("hasPendingWeaveForPost", () => {
  const currentPostId = 42;

  it("returns true when weaves contains an item with post_id === currentPostId and status === 'pending'", () => {
    const weaves: WeaveItemCheck[] = [
      { post_id: 42, status: "pending" },
      { post_id: 99, status: "completed" },
    ];
    assert.equal(hasPendingWeaveForPost(weaves, currentPostId), true);
  });

  it("returns false when weaves is empty, null, or undefined", () => {
    assert.equal(hasPendingWeaveForPost([], currentPostId), false);
    assert.equal(hasPendingWeaveForPost(null, currentPostId), false);
    assert.equal(hasPendingWeaveForPost(undefined, currentPostId), false);
  });

  it("returns false when post_id matches but status is not pending (e.g. requested, completed, cancelled, rejected)", () => {
    const weaves: WeaveItemCheck[] = [
      { post_id: 42, status: "requested" },
      { post_id: 42, status: "completed" },
      { post_id: 42, status: "cancelled" },
      { post_id: 42, status: "rejected" },
    ];
    assert.equal(hasPendingWeaveForPost(weaves, currentPostId), false);
  });

  it("returns false when status is pending but for a different post_id", () => {
    const weaves: WeaveItemCheck[] = [
      { post_id: 100, status: "pending" },
      { post_id: 101, status: "pending" },
    ];
    assert.equal(hasPendingWeaveForPost(weaves, currentPostId), false);
  });
});
