/**
 * GET /api/me 的 weaves 要走和 GET /api/weaves 同一份 WEAVE_QUERY_BASE。
 * 手抄的 SELECT 曾少了流向單位（receiver_org_unit_name）與發文者（post_author_*）欄位，
 * processWeaveRows 便回傳空字串的單位名稱與 undefined 的發文者。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import meRouter from "./me";
import dbPool from "./utils/db";
import { WEAVE_QUERY_BASE, processWeaveRows } from "./weaves";
import { errorMiddleware } from "./utils/errorHandler";

const USER = { userId: 20, public_id: "me-pub", role: "user", username: "me" };

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async () => [[]]),
    query: jest.fn(async () => [[]]),
  },
}));

//* me → weaves → weaveService 會 import queues，真的 Queue 會去連 Redis
jest.mock("./queue/queues", () => ({}));

jest.mock("./weaves", () => ({
  ...jest.requireActual("./weaves"),
  processWeaveRows: jest.fn(async (rows: unknown[]) => rows),
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = USER;
    next();
  },
}));

function makeApp() {
  const app = express();
  app.use("/api/me", meRouter);
  app.use(errorMiddleware);
  return app;
}

describe("GET /api/me weaves", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads weaves through the shared WEAVE_QUERY_BASE for the viewer", async () => {
    const res = await request(makeApp()).get("/api/me");

    expect(res.status).toBe(200);
    const execute = dbPool.execute as unknown as jest.Mock;
    const weaveCall = execute.mock.calls.find(([sql]) => /FROM weaves w/.test(sql as string));
    expect(weaveCall).toBeDefined();
    const [sql, params] = weaveCall as [string, unknown[]];
    expect(normalize(sql).startsWith(normalize(WEAVE_QUERY_BASE))).toBe(true);
    expect(params).toEqual([USER.userId, USER.userId]);
    expect(processWeaveRows).toHaveBeenCalledWith([], { viewerUserId: USER.userId });
  });
});
