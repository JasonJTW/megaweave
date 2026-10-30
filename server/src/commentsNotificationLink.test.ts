/**
 * 留言通知的 link 必須使用 posts.public_id（UUID），
 * 不能用數字 posts.id —— GET /api/posts/:id 只接受 public_id，
 * 數字 id 的連結點開會是 400/404。
 */

import express from "express";
import request from "supertest";
import commentsRouter from "./comments";
import dbPool from "./utils/db";
import { createNotification } from "./utils/notificationService";

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
  it("links to /item/<public_id>, not the numeric post id", async () => {
    const execute = jest
      .fn()
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
});
