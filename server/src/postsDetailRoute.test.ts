/**
 * GET /api/posts/:id 的輸入驗證與 viewerIp 來源測試。
 *
 * 1. 非 UUID 的 id 要在 handler 擋下（400），不能送進 MySQL。
 * 2. viewerIp 用 req.ip，不能信任可偽造的 X-Forwarded-For header
 *    （否則每次換 header 值即可繞過觀看數去重）。
 */

import express from "express";
import request from "supertest";
import postsRouter from "./posts";
import { postService } from "./services/postService";
import * as sessionModule from "./session";

jest.mock("./utils/db", () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("./services/postService", () => ({
  postService: {
    getViewedPosts: jest.fn(),
    getPostByPublicId: jest.fn(),
  },
}));

jest.mock("./session", () => ({
  getUserFromCookie: jest.fn(),
  updateUserSession: jest.fn(),
}));

jest.mock("./queue/queues", () => ({
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(true),
  enqueuePostEmbedding: jest.fn().mockResolvedValue(true),
}));

jest.mock("./utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(true),
}));

jest.mock("./utils/redis", () => ({
  getRedisClient: jest.fn(() => ({ isOpen: true, isReady: true })),
}));

const VALID_ID = "123e4567-e89b-42d3-a456-426614174000";

function makeApp() {
  const app = express();
  app.use("/api/posts", postsRouter);
  return app;
}

describe("GET /api/posts/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue(null);
  });

  it.each(["hello", "123", "x".repeat(500), `${VALID_ID}-extra`])(
    "rejects non-UUID id %# with 400 without querying the service",
    async (id) => {
      const res = await request(makeApp()).get(`/api/posts/${id}`);

      expect(res.status).toBe(400);
      expect(postService.getPostByPublicId).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a well-formed UUID that does not exist", async () => {
    (postService.getPostByPublicId as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(makeApp()).get(`/api/posts/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(postService.getPostByPublicId).toHaveBeenCalledTimes(1);
  });

  it("ignores a spoofed X-Forwarded-For header when building viewerIp", async () => {
    (postService.getPostByPublicId as jest.Mock).mockResolvedValueOnce(null);

    await request(makeApp())
      .get(`/api/posts/${VALID_ID}`)
      .set("X-Forwarded-For", "6.6.6.6");

    const options = (postService.getPostByPublicId as jest.Mock).mock
      .calls[0][1];
    expect(options.viewerIp).not.toContain("6.6.6.6");
  });
});
