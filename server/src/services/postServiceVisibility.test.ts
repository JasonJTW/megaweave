/**
 * postService 讀取使用者貼文列表時的組織可見性（ADR 0003）：
 * - getUserPosts 是公開介面：只有個人貼文與 Public 組織貼文。
 * - getViewedPosts 依檢視者範圍：失去成員資格後，看不到的組織貼文從瀏覽紀錄消失。
 */

import { postService } from "./postService";
import {
  FAKE_ORG_ID,
  fakeOnPublicSurface,
  fakeVisibleToViewer,
  MEMBERSHIP_SQL,
  POSTS_BY_TIER,
  type FakeMembership,
} from "../testUtils/fakePostVisibility";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

let memberships: FakeMembership[] = [];

// 檢視者看過全部四篇貼文；查詢綁定參數的順序是 [userId, ...visibility, (limit, offset)]
function run(rawSql: string, params: unknown[] = []) {
  const sql = normalize(rawSql);
  if (sql === MEMBERSHIP_SQL) return [memberships];
  if (sql.includes("FROM post_views pv")) {
    const visibilityParams = sql.includes("LIMIT ? OFFSET ?")
      ? params.slice(1, -2)
      : params.slice(1);
    const visible = POSTS_BY_TIER.filter((post) => fakeVisibleToViewer(sql, post, visibilityParams));
    return sql.startsWith("SELECT COUNT") ? [[{ total: visible.length }]] : [visible];
  }
  if (sql.includes("FROM posts p") && sql.includes("WHERE p.user_id = ?")) {
    return [POSTS_BY_TIER.filter((post) => fakeOnPublicSurface(sql, post))];
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

jest.mock("../utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (sql: string, params: unknown[]) => run(sql, params)),
    query: jest.fn(async (sql: string, params: unknown[]) => run(sql, params)),
  },
}));
jest.mock("../utils/redis");
jest.mock("./embeddingService");
jest.mock("../queue/queues", () => ({}));

const titles = (rows: Array<Record<string, unknown>>) => rows.map((row) => row.title);

beforeEach(() => {
  memberships = [];
});

describe("postService.getUserPosts", () => {
  it("returns personal and Public org posts only, even for an author inside the org", async () => {
    const rows = await postService.getUserPosts(10);

    expect(titles(rows)).toEqual(["personal", "org-public"]);
  });
});

describe("postService.getViewedPosts", () => {
  it("drops Internal and Members org posts once the viewer holds no membership", async () => {
    const { posts, pagination } = await postService.getViewedPosts(20);

    expect(titles(posts)).toEqual(["personal", "org-public"]);
    expect(pagination.totalPosts).toBe(2);
  });

  it("keeps Members but not Internal posts for an Org Member", async () => {
    memberships = [{ org_id: FAKE_ORG_ID, access_level: "member" }];

    const { posts, pagination } = await postService.getViewedPosts(20);

    expect(titles(posts)).toEqual(["personal", "org-public", "org-members"]);
    expect(pagination.totalPosts).toBe(3);
  });

  it("keeps every tier for Internal access", async () => {
    memberships = [{ org_id: FAKE_ORG_ID, access_level: "internal" }];

    const { posts } = await postService.getViewedPosts(20);

    expect(titles(posts)).toEqual(["personal", "org-public", "org-members", "org-internal"]);
  });
});
