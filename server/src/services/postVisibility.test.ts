import { postVisibleIn, publicSurfaceCondition, scopeFromMemberships } from "./postVisibility";

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
