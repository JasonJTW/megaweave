/**
 * 留言通知的 link 必須使用 posts.public_id（UUID），
 * 不能用數字 posts.id —— GET /api/posts/:id 只接受 public_id，
 * 數字 id 的連結點開會是 400/404。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import commentsRouter from "./comments";
import dbPool from "./utils/db";
import { createNotification } from "./utils/notificationService";
import { errorMiddleware } from "./utils/errorHandler";

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: { getConnection: jest.fn() },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (
    req: { user?: unknown },
    _res: unknown,
    next: () => void,
  ) => {
    req.user = { userId: 10, role: "user", username: "commenter" };
    next();
  },
}));

jest.mock("./queue/queues", () => ({
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(true),
}));

jest.mock("./utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(true),
}));

const POST_PUBLIC_ID = "123e4567-e89b-42d3-a456-426614174000";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.set("io", {});
  app.use("/comments", commentsRouter);
  return app;
}

describe("POST /comments notification link", () => {
  beforeEach(() => jest.clearAllMocks());

  it("links to /item/<public_id>, not the numeric post id", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce([[]]) // SELECT org_memberships (no orgs)
      .mockResolvedValueOnce([[{ 1: 1 }]]) // post visible to the commenter
      .mockResolvedValueOnce([{ insertId: 7 }]) // INSERT comment
      .mockResolvedValueOnce([{}]) // UPDATE root_id
      .mockResolvedValueOnce([[{ id: 7, username: "commenter" }]]) // SELECT new comment
      .mockResolvedValueOnce([
        [{ user_id: 5, title: "Sofa", public_id: POST_PUBLIC_ID }],
      ]); // SELECT post
    (dbPool.getConnection as jest.Mock).mockResolvedValue({
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute,
    });

    const res = await request(makeApp())
      .post("/comments")
      .send({ post_id: 123, content: "hello" });

    expect(res.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "COMMENT",
        params: { actorName: "commenter", postTitle: "Sofa" },
        link: `/item/${POST_PUBLIC_ID}#comment-7`,
      }),
    );
  });

  it("notifies the parent comment's author with a reply event", async () => {
    const execute = jest.fn(async (sql: string) => {
      if (sql.includes("FROM org_memberships")) return [[]];
      if (sql.startsWith("INSERT INTO comments")) return [{ insertId: 8 }];
      if (sql.includes("FROM posts"))
        return [[{ user_id: 5, title: "Sofa", public_id: POST_PUBLIC_ID }]];
      if (sql.includes("SELECT user_id FROM comments")) return [[{ user_id: 6 }]];
      if (/FROM comments c\s/.test(sql))
        return [[{ id: 8, username: "commenter" }]];
      if (sql.includes("FROM comments"))
        return [[{ id: 3, post_id: 123, item_id: null, depth: 0, root_id: 3, path: null }]];
      return [{}];
    });
    (dbPool.getConnection as jest.Mock).mockResolvedValue({
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute,
    });

    const res = await request(makeApp())
      .post("/comments")
      .send({ post_id: 123, parent_id: 3, content: "hi" });

    expect(res.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: 6,
        type: "COMMENT_REPLY",
        params: { actorName: "commenter" },
        link: `/item/${POST_PUBLIC_ID}#comment-8`,
      }),
    );
  });

  it("returns 404 for a post the commenter cannot see, without writing or notifying", async () => {
    const execute = jest.fn(async (sql: string) => {
      if (sql.includes("FROM org_memberships")) return [[]];
      if (sql.includes("FROM posts")) return [[]]; // Internal org post: filtered out
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const rollback = jest.fn();
    (dbPool.getConnection as jest.Mock).mockResolvedValue({
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback,
      release: jest.fn(),
      execute,
    });
    const app = makeApp();
    app.use(errorMiddleware);

    const res = await request(app)
      .post("/comments")
      .send({ post_id: 123, content: "hello" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
    expect(rollback).toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO comments"),
      expect.anything(),
    );
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("POST /comments post_id validation", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([["abc"], [1.5], [-1], [0], ["5abc"], [null], [undefined], [true], [["5"]]])(
    "rejects a malformed post_id (%p) with INVALID_REQUEST before touching the DB",
    async (postId) => {
      const app = makeApp();
      app.use(errorMiddleware);

      const res = await request(app)
        .post("/comments")
        .send({ post_id: postId, content: "hello" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
      expect(dbPool.getConnection).not.toHaveBeenCalled();
    },
  );

  it("accepts a numeric-string post_id and uses the parsed number", async () => {
    const execute = jest.fn(async (sql: string) => {
      if (sql.includes("FROM org_memberships")) return [[]];
      if (sql.startsWith("INSERT INTO comments")) return [{ insertId: 9 }];
      if (sql.includes("FROM posts"))
        return [[{ 1: 1, user_id: 5, title: "Sofa", public_id: POST_PUBLIC_ID }]];
      if (/FROM comments c\s/.test(sql)) return [[{ id: 9, username: "commenter" }]];
      return [{}];
    });
    (dbPool.getConnection as jest.Mock).mockResolvedValue({
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute,
    });

    const res = await request(makeApp())
      .post("/comments")
      .send({ post_id: "123", content: "hello" });

    expect(res.status).toBe(201);
    const insert = execute.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO comments"));
    expect((insert as unknown as [string, unknown[]])[1][0]).toBe(123);
  });
});
