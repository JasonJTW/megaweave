import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWeavesFilter } from "./weaveQuery";

describe("buildWeavesFilter", () => {
  it("builds default filter for both giver and receiver", () => {
    const { whereClause, params } = buildWeavesFilter({ userId: 10 });
    assert.equal(whereClause, "WHERE (w.giver_id = ? OR w.receiver_id = ?)");
    assert.deepEqual(params, [10, 10]);
  });

  it("filters by role=giver", () => {
    const { whereClause, params } = buildWeavesFilter({ userId: 10, role: "giver" });
    assert.equal(whereClause, "WHERE w.giver_id = ?");
    assert.deepEqual(params, [10]);
  });

  it("filters by role=receiver", () => {
    const { whereClause, params } = buildWeavesFilter({ userId: 10, role: "receiver" });
    assert.equal(whereClause, "WHERE w.receiver_id = ?");
    assert.deepEqual(params, [10]);
  });

  it("filters by postId and status='pending'", () => {
    const { whereClause, params } = buildWeavesFilter({
      userId: 10,
      postId: 42,
      status: "pending",
    });
    assert.equal(
      whereClause,
      "WHERE (w.giver_id = ? OR w.receiver_id = ?) AND w.post_id = ? AND w.status = ?",
    );
    assert.deepEqual(params, [10, 10, 42, "pending"]);
  });
});
