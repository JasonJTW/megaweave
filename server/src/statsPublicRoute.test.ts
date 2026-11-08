/**
 * 公開個人頁統計（GET /api/user/stats/public/:uuid）的貼文列表是公開介面：
 * Internal／Members 組織貼文不能出現（ADR 0003）。
 */

import express from "express";
import request from "supertest";
import statsRouter from "./stats";
import { errorMiddleware } from "./utils/errorHandler";
import { fakeOnPublicSurface, POSTS_BY_TIER } from "./testUtils/fakePostVisibility";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

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
          ),
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock("./utils/updateUserStats", () => ({ updateUserStats: jest.fn() }));

const USER_UUID = "123e4567-e89b-42d3-a456-426614174000";

function makeApp() {
  const app = express();
  app.use("/api/user/stats", statsRouter);
  app.use(errorMiddleware);
  return app;
}

describe("GET /api/user/stats/public/:uuid", () => {
  it("lists personal posts only: org items, even Public ones, would expose the Unit Contact", async () => {
    const res = await request(makeApp()).get(`/api/user/stats/public/${USER_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { title: string }) => p.title)).toEqual([
      "personal",
    ]);
  });
});
