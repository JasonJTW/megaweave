import express from "express";
import { z } from "zod";
import request from "supertest";
import { errorMiddleware } from "../errorHandler";
import { HttpError } from "../httpError";

//* 建一個只會丟出指定錯誤的 app，透過真實 HTTP 回應驗證 middleware 行為
function appThatFailsWith(error: unknown) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(error));
  app.use(errorMiddleware);
  return app;
}

describe("errorMiddleware", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("responds with the HttpError status, code and message", async () => {
    const res = await request(
      appThatFailsWith(new HttpError(404, "POST_NOT_FOUND", "Post not found")),
    ).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: "POST_NOT_FOUND",
      errorMessage: "Post not found",
    });
  });

  it("passes HttpError params through for the client's translation", async () => {
    const res = await request(
      appThatFailsWith(
        new HttpError(400, "USE_SOCIAL_SIGNIN", "Use Google to sign in", {
          providers: "Google",
        }),
      ),
    ).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: "USE_SOCIAL_SIGNIN",
      errorMessage: "Use Google to sign in",
      params: { providers: "Google" },
    });
  });

  it("responds 400 VALIDATION_FAILED with the first issue for a ZodError", async () => {
    const parsed = z.object({ title: z.string() }).safeParse({ title: 1 });
    if (parsed.success) throw new Error("expected parse failure");

    const res = await request(appThatFailsWith(parsed.error)).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errorMessage).toEqual(expect.any(String));
    expect(res.body.errorDetails).toHaveLength(1);
  });

  it("responds 400 DUPLICATE_ENTRY for a MySQL ER_DUP_ENTRY error", async () => {
    const dup = Object.assign(
      new Error("Duplicate entry 'a@b.c' for key 'users.email'"),
      { code: "ER_DUP_ENTRY" },
    );

    const res = await request(appThatFailsWith(dup)).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: "DUPLICATE_ENTRY",
      errorMessage: "Duplicate entry",
    });
  });

  it.each([
    ["an Error", new Error("connect ECONNREFUSED 10.0.0.5:3306")],
    [
      "a MySQL access error",
      Object.assign(new Error("Access denied for 'root'"), {
        code: "ER_ACCESS_DENIED_ERROR",
      }),
    ],
    ["a string", "SELECT * FROM users failed"],
    ["a plain object", { reason: "pool exhausted" }],
  ])(
    "responds 500 INTERNAL_ERROR without internals for %s",
    async (_label, error) => {
      const res = await request(appThatFailsWith(error)).get("/boom");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: "INTERNAL_ERROR",
        errorMessage: "Internal server error",
      });
    },
  );
});
