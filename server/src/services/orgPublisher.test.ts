/**
 * 組織貼文的發文者顯示（#140，PRD 0001 §5.1「公開層顯示」；ADR 0004）
 * 卡片、詳情、Weave、通知、SEO 都經過這裡：組織貼文一律換成組織名義，不出現窗口個人帳號。
 */
import {
  ANONYMOUS_PUBLISHER_NAME,
  maskOrgComments,
  maskOrgPublishers,
  orgPostContactToken,
  parseContactToken,
  publisherName,
} from "./orgPublisher";

describe("publisherName", () => {
  it.each([
    ["org", "甲公司"],
    ["org_unit", "甲公司 · 總務部"],
    ["anonymous", ANONYMOUS_PUBLISHER_NAME],
  ] as const)("shows %s as %s", (display, expected) => {
    expect(publisherName({ display, orgName: "甲公司", unitName: "總務部" })).toBe(expected);
  });

  it("falls back to the org name when the unit is unknown", () => {
    expect(publisherName({ display: "org_unit", orgName: "甲公司", unitName: null })).toBe("甲公司");
  });
});

describe("contact tokens", () => {
  it("round-trips a post token and rejects anything else", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(parseContactToken(orgPostContactToken(id))).toEqual({ kind: "post", postPublicId: id });
    expect(parseContactToken("org-conv:12")).toEqual({ kind: "conversation", conversationId: 12 });
    expect(parseContactToken("u-1")).toBeNull();
    expect(parseContactToken("org-post:not-a-uuid")).toBeNull();
    expect(parseContactToken("org-conv:abc")).toBeNull();
  });
});

describe("maskOrgPublishers", () => {
  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("FROM organizations")) {
        return [[{ id: 10, name: "甲公司", publisher_display: "org_unit" }], []];
      }
      if (sql.includes("FROM org_units")) return [[{ id: 201, name: "總務部" }], []];
      throw new Error(`unexpected SQL ${sql}`);
    }),
  };

  const contactRow = () => ({
    id: 1000,
    public_id: "33333333-3333-4333-8333-333333333333",
    org_id: 10,
    org_unit_id: 201,
    user_id: 2,
    author_user_id: 2,
    username: "王小明",
    author_public_id: "u-2",
    avatar_url: "https://cdn/avatar.png",
    email: "ming@example.com",
  });
  const personalRow = {
    id: 1,
    public_id: "44444444-4444-4444-8444-444444444444",
    org_id: null,
    user_id: 5,
    author_user_id: 5,
    username: "Alice",
    author_public_id: "u-5",
    avatar_url: "a.png",
  };

  it("replaces every trace of the contact on org posts and leaves personal posts alone", async () => {
    const [org, personal] = await maskOrgPublishers(db, [contactRow(), { ...personalRow }]);

    expect(org).toMatchObject({
      username: "甲公司 · 總務部",
      author_public_id: "org-post:33333333-3333-4333-8333-333333333333",
      user_id: null,
      author_user_id: null,
      avatar_url: null,
      publisher: { type: "org", name: "甲公司 · 總務部" },
    });
    expect(org).not.toHaveProperty("email");
    expect(JSON.stringify(org)).not.toMatch(/王小明|u-2|ming@|avatar\.png/);
    expect(personal).toEqual(personalRow);
  });

  it("keeps the contact's own view of their item unmasked", async () => {
    const [org] = await maskOrgPublishers(db, [contactRow()], { viewerUserId: 2 });
    expect(org.username).toBe("王小明");
  });

  it("does not query when there are no org posts", async () => {
    db.query.mockClear();
    await maskOrgPublishers(db, [{ ...personalRow }]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("maskOrgComments", () => {
  //* 經手人 2；總務部另一位窗口 7、Org Admin 1；交接前的經手人 9
  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("FROM posts")) {
        return [[{ public_id: "33333333-3333-4333-8333-333333333333", user_id: 2, org_id: 10, org_unit_id: 201 }], []];
      }
      if (sql.includes("FROM organizations")) return [[{ id: 10, name: "甲公司", publisher_display: "org" }], []];
      if (sql.includes("FROM org_memberships")) {
        return [[{ user_id: 1 }, { user_id: 2 }, { user_id: 7 }, { user_id: 9 }], []];
      }
      return [[{ id: 201, name: "總務部" }], []];
    }),
  };

  const comments = () => [
    { id: 1, user_id: 5, username: "Alice", avatar_url: "a.png", public_id: "u-5" },
    { id: 2, user_id: 2, username: "王小明", avatar_url: "ming.png", public_id: "u-2" },
    { id: 3, user_id: 7, username: "陳同事", avatar_url: "c.png", public_id: "u-7" },
    { id: 4, user_id: 1, username: "管理員", avatar_url: "m.png", public_id: "u-1" },
    { id: 5, user_id: 9, username: "前窗口", avatar_url: "p.png", public_id: "u-9" },
  ];
  const asOrg = {
    username: "甲公司",
    avatar_url: null,
    user_id: null,
    public_id: "org-post:33333333-3333-4333-8333-333333333333",
  };

  it("shows every contact, Org Admin and earlier handler as the org and leaves the public alone", async () => {
    const [publicComment, ...orgSide] = await maskOrgComments(db, 1000, comments());

    expect(publicComment).toMatchObject({ username: "Alice", public_id: "u-5", user_id: 5 });
    for (const comment of orgSide) expect(comment).toMatchObject(asOrg);
  });

  it("keeps a viewer's own comments unmasked so they can edit them", async () => {
    const rows = await maskOrgComments(db, 1000, comments(), { viewerUserId: 7 });

    expect(rows[2]).toMatchObject({ username: "陳同事", user_id: 7 });
    expect(rows[1]).toMatchObject(asOrg);
  });
});
