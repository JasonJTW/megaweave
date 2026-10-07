/**
 * 瀏覽紀錄 API 的 route 註冊回歸測試。
 *
 * 背景：`GET /api/posts/history` 曾在一次 posts.ts 整檔重構中被整段刪掉
 * (commit bfe7708)，前端 /history 頁因此沉默地壞掉三週——請求落到
 * `GET /:id`，以 publicId="history" 查不到貼文而回 404。
 *
 * 這組測試同時守住兩件事：
 *   1. route 存在（不是 404）。
 *   2. route 註冊順序在 `GET /:id` 之前，否則會再次被當成 publicId 吃掉。
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

const EMPTY_HISTORY = {
  posts: [],
  pagination: {
    currentPage: 1,
    totalPages: 0,
    totalPosts: 0,
    postsPerPage: 20,
  },
};

function makeApp() {
  const app = express();
  app.use("/api/posts", postsRouter);
  return app;
}

function signIn() {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue({
    userId: 42,
    email: "viewer@example.com",
    role: "user",
  });
}

describe("GET /api/posts/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is registered before GET /:id so that 'history' is never read as a publicId", () => {
    interface Layer {
      route?: { path: string; methods: Record<string, boolean> };
    }
    const layers = (postsRouter as unknown as { stack: Layer[] }).stack;
    const getPaths = layers
      .filter((l) => l.route?.methods.get === true)
      .map((l) => l.route!.path);

    const historyIndex = getPaths.indexOf("/history");
    const idIndex = getPaths.indexOf("/:id");

    expect(historyIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeLessThan(idIndex);
  });

  it("returns the viewing history for a signed-in user", async () => {
    signIn();
    const payload = {
      posts: [{ id: 1, title: "Sofa", viewed_at: "2026-10-01T00:00:00.000Z" }],
      pagination: {
        currentPage: 1,
        totalPages: 2,
        totalPosts: 25,
        postsPerPage: 20,
      },
    };
    (postService.getViewedPosts as jest.Mock).mockResolvedValueOnce(payload);

    const res = await request(makeApp()).get("/api/posts/history");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    // 回歸守門：絕不能掉到 GET /:id 去查一篇叫 "history" 的貼文
    expect(postService.getPostByPublicId).not.toHaveBeenCalled();
  });

  it("always returns a pagination object, so the client can read it unguarded", async () => {
    signIn();
    (postService.getViewedPosts as jest.Mock).mockResolvedValueOnce(
      EMPTY_HISTORY,
    );

    const res = await request(makeApp()).get("/api/posts/history");

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      currentPage: 1,
      totalPages: 0,
      totalPosts: 0,
      postsPerPage: 20,
    });
  });

  it("defaults to page 1 with a limit of 20", async () => {
    signIn();
    (postService.getViewedPosts as jest.Mock).mockResolvedValueOnce(
      EMPTY_HISTORY,
    );

    await request(makeApp()).get("/api/posts/history");

    expect(postService.getViewedPosts).toHaveBeenCalledWith(42, 1, 20);
  });

  it("passes page and limit through to the service", async () => {
    signIn();
    (postService.getViewedPosts as jest.Mock).mockResolvedValueOnce(
      EMPTY_HISTORY,
    );

    await request(makeApp()).get("/api/posts/history?page=3&limit=5");

    expect(postService.getViewedPosts).toHaveBeenCalledWith(42, 3, 5);
  });

  it("falls back to the defaults when page and limit are not numbers", async () => {
    signIn();
    (postService.getViewedPosts as jest.Mock).mockResolvedValueOnce(
      EMPTY_HISTORY,
    );

    await request(makeApp()).get("/api/posts/history?page=abc&limit=");

    expect(postService.getViewedPosts).toHaveBeenCalledWith(42, 1, 20);
  });

  it("rejects an unauthenticated request with 401, not 404", async () => {
    (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue(null);

    const res = await request(makeApp()).get("/api/posts/history");

    // 404 代表 route 又不見了、請求被 GET /:id 接走
    expect(res.status).toBe(401);
    expect(postService.getViewedPosts).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    signIn();
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (postService.getViewedPosts as jest.Mock).mockRejectedValueOnce(
      new Error("db down"),
    );

    const res = await request(makeApp()).get("/api/posts/history");

    expect(res.status).toBe(500);
    expect(res.body.errorMessage).toBe("Internal server error");
    consoleError.mockRestore();
  });
});
