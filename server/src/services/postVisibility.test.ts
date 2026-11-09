import {
  loadViewerScope,
  PUBLIC_SCOPE,
  postVisibleIn,
  publicSurfaceCondition,
  scopeFromMemberships,
} from "./postVisibility";

describe("scopeFromMemberships", () => {
  it("gives Internal access the Internal and Members tiers, and Org Members only Members", () => {
    expect(
      scopeFromMemberships([
        { orgId: 12, accessLevel: "internal" },
        { orgId: 30, accessLevel: "member" },
      ]),
    ).toEqual({
      orgs: [
        { orgId: 12, tiers: ["internal", "members"] },
        { orgId: 30, tiers: ["members"] },
      ],
    });
  });
});

describe("postVisibleIn", () => {
  it("binds each org's id and tiers as parameters", () => {
    const { sql, params } = postVisibleIn(
      scopeFromMemberships([{ orgId: 12, accessLevel: "internal" }]),
      "p",
    );
    expect(params).toEqual([12, "internal", "members"]);
    expect(sql.split("?")).toHaveLength(params.length + 1);
  });

  it("needs no parameters for a viewer without memberships", () => {
    expect(postVisibleIn(scopeFromMemberships([])).params).toEqual([]);
  });
});

describe("table alias", () => {
  it("rejects an alias that is not a plain identifier", () => {
    expect(() => publicSurfaceCondition("p; DROP TABLE posts")).toThrow(/alias/);
    expect(() => postVisibleIn(scopeFromMemberships([]), "p.x")).toThrow(/alias/);
  });
});

describe("loadViewerScope", () => {
  it("builds the scope from the viewer's org memberships", async () => {
    const execute = jest.fn().mockResolvedValue([
      [
        { org_id: 12, access_level: "internal" },
        { org_id: 30, access_level: "member" },
      ],
    ]);
    await expect(loadViewerScope({ execute }, 7)).resolves.toEqual({
      orgs: [
        { orgId: 12, tiers: ["internal", "members"] },
        { orgId: 30, tiers: ["members"] },
      ],
    });
    expect(execute.mock.calls[0][1]).toEqual([7, 7]);
  });

  it("gives a Platform Admin Internal in every org, merged with their own memberships", async () => {
    //* SQL 的 UNION 段為 Platform Admin 每個組織各補一列 Internal；同組織的 Member 列被 Internal 蓋過
    const execute = jest.fn().mockResolvedValue([
      [
        { org_id: 30, access_level: "member" },
        { org_id: 12, access_level: "internal" },
        { org_id: 30, access_level: "internal" },
      ],
    ]);
    await expect(loadViewerScope({ execute }, 7)).resolves.toEqual({
      orgs: [
        { orgId: 30, tiers: ["internal", "members"] },
        { orgId: 12, tiers: ["internal", "members"] },
      ],
    });
    expect(execute.mock.calls[0][0]).toContain("u.role = 'admin'");
  });

  it("gives signed-out viewers the Public scope without querying", async () => {
    const execute = jest.fn();
    await expect(loadViewerScope({ execute }, undefined)).resolves.toBe(PUBLIC_SCOPE);
    expect(execute).not.toHaveBeenCalled();
  });
});
