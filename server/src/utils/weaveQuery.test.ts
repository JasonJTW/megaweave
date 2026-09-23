import { buildWeavesFilter, WeavesListQuerySchema } from "./weaveQuery";

describe("buildWeavesFilter", () => {
  it("builds default filter for both giver and receiver", () => {
    const { whereClause, params } = buildWeavesFilter({ userId: 10 });
    expect(whereClause).toBe("WHERE (w.giver_id = ? OR w.receiver_id = ?)");
    expect(params).toEqual([10, 10]);
  });

  it("filters by role=giver", () => {
    const { whereClause, params } = buildWeavesFilter({
      userId: 10,
      role: "giver",
    });
    expect(whereClause).toBe("WHERE w.giver_id = ?");
    expect(params).toEqual([10]);
  });

  it("filters by role=receiver", () => {
    const { whereClause, params } = buildWeavesFilter({
      userId: 10,
      role: "receiver",
    });
    expect(whereClause).toBe("WHERE w.receiver_id = ?");
    expect(params).toEqual([10]);
  });

  it("filters by postId and status='pending'", () => {
    const { whereClause, params } = buildWeavesFilter({
      userId: 10,
      postId: 42,
      status: "pending",
    });
    expect(whereClause).toBe(
      "WHERE (w.giver_id = ? OR w.receiver_id = ?) AND w.post_id = ? AND w.status = ?",
    );
    expect(params).toEqual([10, 10, 42, "pending"]);
  });

  it("combines role with postId", () => {
    const { whereClause, params } = buildWeavesFilter({
      userId: 10,
      role: "giver",
      postId: 42,
    });
    expect(whereClause).toBe("WHERE w.giver_id = ? AND w.post_id = ?");
    expect(params).toEqual([10, 42]);
  });
});

describe("WeavesListQuerySchema", () => {
  it("coerces postId from query string", () => {
    const parsed = WeavesListQuerySchema.parse({
      postId: "42",
      status: "pending",
    });
    expect(parsed).toEqual({ postId: 42, status: "pending" });
  });

  it("rejects unknown status and non-numeric postId", () => {
    expect(WeavesListQuerySchema.safeParse({ status: "bogus" }).success).toBe(
      false,
    );
    expect(WeavesListQuerySchema.safeParse({ postId: "abc" }).success).toBe(
      false,
    );
  });
});
