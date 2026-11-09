/**
 * 公開交易紀錄（GET /api/weaves/public/:uuid）是公開介面：
 * Internal／Members 組織貼文的交換不能出現（ADR 0003）。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import weavesRouter from "./weaves";
import { errorMiddleware } from "./utils/errorHandler";
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
            giver_id: 10,
            receiver_id: 20,
            post_id_original: post.id,
            post_title: post.title,
          })),
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    query: jest.fn(async () => [[]]), // weave_items
  },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("./utils/weaveService", () => ({}));
jest.mock("./queue/queues", () => ({ enqueueUserVectorUpdate: jest.fn() }));

const USER_UUID = "123e4567-e89b-42d3-a456-426614174000";

function makeApp() {
  const app = express();
  app.use("/api/weaves", weavesRouter);
  app.use(errorMiddleware);
  return app;
}

describe("GET /api/weaves/public/:uuid", () => {
  it("lists weaves on personal and Public org posts only, never Internal or Members ones", async () => {
    const res = await request(makeApp()).get(`/api/weaves/public/${USER_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.weaves.map((w: { post: { title: string } }) => w.post.title)).toEqual([
      "personal",
      "org-public",
    ]);
  });
});
