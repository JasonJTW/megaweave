/**
 * 公開個人頁統計（GET /api/user/stats/public/:uuid）的貼文列表是公開介面：
 * Internal／Members 組織貼文不能出現（ADR 0003），也只回 client 卡片用得到的欄位
 * （embedding、location_id、org 欄位等內部資料不能出去）。
 * 走 createApp() 的完整 middleware 鏈。
 */
import type { Express } from "express";
import { request } from "./testUtils/testApi";
import { fakeOnPublicSurface, POSTS_BY_TIER } from "./testUtils/fakePostVisibility";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

/** posts 表的完整一列：SQL 寫 p.* 就會整列回傳 */
const fullPostRow = (post: (typeof POSTS_BY_TIER)[number]) => ({
  id: post.id,
  public_id: `00000000-0000-4000-8000-00000000000${post.id}`,
  user_id: 10,
  org_id: post.org_id,
  org_unit_id: post.org_id == null ? null : 3,
  audience_tier: post.audience_tier,
  title: post.title,
  content: "content",
  location_id: 55,
  type: "share",
  status: "active",
  tags: "a,b",
  category_id: 2,
  condition_level: 3,
  expires_at: "2027-01-01T00:00:00.000Z",
  view_count: 4,
  likes_count: 5,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  comment_count: 6,
  hot_score: 1.5,
  embedding: [0.1, 0.2, 0.3],
  s3_keys: "a.jpg,b.jpg",
});

//* 模擬 MySQL 的 SELECT 清單：p.* 回整列，否則只回列出的 p.<column> 與別名
function project(sql: string, row: Record<string, unknown>) {
  const selectList = sql.slice(sql.indexOf("SELECT") + 6, sql.indexOf(" FROM posts p"));
  if (/\bp\.\*/.test(selectList)) return row;
  const out: Record<string, unknown> = {};
  for (const [, column] of selectList.matchAll(/\bp\.(\w+)/g)) out[column] = row[column];
  if (/\bas s3_keys\b/i.test(selectList)) out.s3_keys = row.s3_keys;
  return out;
}

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (rawSql: string) => {
      const sql = normalize(rawSql);
      if (sql.startsWith("SELECT id FROM users WHERE public_id = ?")) return [[{ id: 10 }]];
      if (sql.includes("FROM user_stats")) return [[]];
      if (sql.includes("FROM posts p")) {
        //* 個人頁只列個人貼文（#140）：組織物品屬於組織，列在窗口個人頁會曝光經手的人
        const personalOnly = sql.includes("p.org_id IS NULL AND");
        return [
          POSTS_BY_TIER.filter(
            (post) => fakeOnPublicSurface(sql, post) && (!personalOnly || post.org_id === null),
          ).map((post) => project(sql, fullPostRow(post))),
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  },
}));

const USER_UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("GET /api/user/stats/public/:uuid", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  it("lists personal posts only: org items, even Public ones, would expose the Unit Contact", async () => {
    const res = await request(app).get(`/api/user/stats/public/${USER_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { title: string }) => p.title)).toEqual(["personal"]);
  });

  it("does not return internal post columns such as the embedding or location_id", async () => {
    const res = await request(app).get(`/api/user/stats/public/${USER_UUID}`);

    const [post] = res.body.posts;
    for (const column of [
      "embedding",
      "location_id",
      "user_id",
      "org_id",
      "org_unit_id",
      "audience_tier",
      "hot_score",
      "deleted_at",
    ]) {
      expect(post).not.toHaveProperty(column);
    }
  });

  it("still returns the fields the profile page and owner sidebar render", async () => {
    const res = await request(app).get(`/api/user/stats/public/${USER_UUID}`);

    expect(res.body.posts[0]).toEqual({
      id: 1,
      public_id: "00000000-0000-4000-8000-000000000001",
      title: "personal",
      content: "content",
      type: "share",
      status: "active",
      tags: "a,b",
      category_id: 2,
      condition_level: 3,
      expires_at: "2027-01-01T00:00:00.000Z",
      view_count: 4,
      likes_count: 5,
      created_at: "2026-01-01T00:00:00.000Z",
      s3_keys: "a.jpg,b.jpg",
    });
  });
});
