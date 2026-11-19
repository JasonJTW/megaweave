/**
 * 公開交易紀錄（GET /api/weaves/public/:uuid）是公開介面：
 * Internal／Members 組織貼文的交換不能出現（ADR 0003），
 * 兩造之間的備註（notes）與對話 id（conversation_id）也不能給任何人看。
 * 走 createApp() 的完整 middleware 鏈。
 */
import type { Express } from "express";
import { request } from "./testUtils/testApi";
import { fakeOnPublicSurface, POSTS_BY_TIER } from "./testUtils/fakePostVisibility";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (rawSql: string) => {
      const sql = normalize(rawSql);
      if (sql.startsWith("SELECT id FROM users WHERE public_id = ?")) return [[{ id: 10 }]];
      if (sql.includes("FROM weaves w")) {
        // 每篇貼文各有一筆交換
        return [
          POSTS_BY_TIER.filter((post) => fakeOnPublicSurface(sql, post)).map((post) => ({
            id: 100 + post.id,
            post_id: post.id,
            giver_id: 20,
            receiver_id: 10,
            status: "completed",
            notes: "my phone is 0912-345-678",
            conversation_id: 900 + post.id,
            post_id_original: post.id,
            post_title: post.title,
          })),
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    query: jest.fn(async () => [[]]), // weave_items, org memberships
  },
}));

const USER_UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("GET /api/weaves/public/:uuid", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  it("lists weaves on personal and Public org posts only, never Internal or Members ones", async () => {
    const res = await request(app).get(`/api/weaves/public/${USER_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.weaves.map((w: { post: { title: string } }) => w.post.title)).toEqual([
      "personal",
      "org-public",
    ]);
  });

  it("does not return the weave notes or the conversation id", async () => {
    const res = await request(app).get(`/api/weaves/public/${USER_UUID}`);

    expect(res.body.weaves).toHaveLength(2);
    for (const weave of res.body.weaves) {
      expect(weave).not.toHaveProperty("notes");
      expect(weave).not.toHaveProperty("conversation_id");
      expect(weave).toMatchObject({ status: "completed", receiver_id: 10 });
    }
    expect(JSON.stringify(res.body)).not.toContain("0912-345-678");
  });
});
