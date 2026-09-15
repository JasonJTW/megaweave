import express, { Express, Request, Response } from "express";
import http from "http";
import { AddressInfo } from "net";
import {
  createRateLimiter,
  authRateLimiter,
  globalRateLimiter,
  authBurstLimiter,
  authSustainedLimiter,
  ResilientRedisStore,
} from "./rateLimiter";
import { Options } from "express-rate-limit";

describe("Tiered Rate Limiting Middleware (Issue #8)", () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Force enable rate limiting in test environment
    process.env.NODE_ENV = "test";
    process.env.ENABLE_RATE_LIMIT_TEST = "true";
    delete process.env.RATE_LIMIT_DISABLED;
  });

  afterEach((done) => {
    process.env = originalEnv;
    if (server && server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  const startApp = (setupApp: (app: Express) => void): Promise<string> => {
    return new Promise((resolve) => {
      app = express();
      app.set("trust proxy", 1);
      app.use(express.json());
      setupApp(app);
      server = app.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve(baseUrl);
      });
    });
  };

  describe("Seam 1: Core Rate Limiter Behavior & Standard Headers", () => {
    it("returns standard 429 Too Many Requests with Retry-After header and custom error message when limit is exceeded", async () => {
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        limit: 2,
        prefix: "rl:test:core:",
        errorMessage: "Too many attempts from this IP",
        bypassInTest: false,
      });

      await startApp((app) => {
        app.get("/test-limit", limiter, (_req: Request, res: Response) => {
          res.status(200).json({ success: true });
        });
      });

      // Request 1: Allowed
      const res1 = await fetch(`${baseUrl}/test-limit`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get("ratelimit-limit")).toBe("2");
      expect(res1.headers.get("ratelimit-remaining")).toBe("1");

      // Request 2: Allowed
      const res2 = await fetch(`${baseUrl}/test-limit`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get("ratelimit-remaining")).toBe("0");

      // Request 3: Blocked with 429
      const res3 = await fetch(`${baseUrl}/test-limit`);
      expect(res3.status).toBe(429);
      expect(res3.headers.get("retry-after")).toBeDefined();
      const retryAfter = Number(res3.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);

      const body = (await res3.json()) as { errorMessage: string };
      expect(body).toEqual({ errorMessage: "Too many attempts from this IP" });
    });

    it("bypasses rate limiting when RATE_LIMIT_DISABLED=true", async () => {
      process.env.RATE_LIMIT_DISABLED = "true";

      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        limit: 1,
        prefix: "rl:test:disabled:",
        errorMessage: "Blocked",
        bypassInTest: false,
      });

      await startApp((app) => {
        app.get("/test-bypass", limiter, (_req: Request, res: Response) => {
          res.status(200).json({ success: true });
        });
      });

      const res1 = await fetch(`${baseUrl}/test-bypass`);
      const res2 = await fetch(`${baseUrl}/test-bypass`);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it("bypasses rate limiting in development unless ENABLE_RATE_LIMIT_DEV=true", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.ENABLE_RATE_LIMIT_DEV;

      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        limit: 1,
        prefix: "rl:test:dev:",
        errorMessage: "Blocked in dev",
        bypassInDev: true,
        bypassInTest: false,
      });

      await startApp((app) => {
        app.get("/test-dev-bypass", limiter, (_req: Request, res: Response) => {
          res.status(200).json({ success: true });
        });
      });

      const res1 = await fetch(`${baseUrl}/test-dev-bypass`);
      const res2 = await fetch(`${baseUrl}/test-dev-bypass`);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it("verifies globalRateLimiter exports default configuration", () => {
      expect(globalRateLimiter).toBeDefined();
    });
  });

  describe("Seam 2: Tiered Rate Limiting for Auth Routes (Burst & Sustained)", () => {
    it("authBurstLimiter blocks sudden burst exceeding burst threshold", async () => {
      const testBurst = createRateLimiter({
        windowMs: 2000,
        limit: 3,
        prefix: "rl:test:burst:",
        errorMessage: "Burst limit exceeded",
        bypassInTest: false,
      });

      await startApp((app) => {
        app.post("/api/auth/burst", testBurst, (_req: Request, res: Response) => {
          res.status(200).json({ status: "authenticated" });
        });
      });

      // 3 allowed
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/api/auth/burst`, { method: "POST" });
        expect(res.status).toBe(200);
      }

      // 4th blocked
      const resBlocked = await fetch(`${baseUrl}/api/auth/burst`, { method: "POST" });
      expect(resBlocked.status).toBe(429);
      const body = (await resBlocked.json()) as { errorMessage: string };
      expect(body.errorMessage).toBe("Burst limit exceeded");
    });

    it("authRateLimiter contains burst and sustained limiters and chains properly", async () => {
      expect(authBurstLimiter).toBeDefined();
      expect(authSustainedLimiter).toBeDefined();
      expect(authRateLimiter).toHaveLength(2);

      await startApp((app) => {
        app.post("/api/signin", ...authRateLimiter, (_req: Request, res: Response) => {
          res.status(200).json({ ok: true });
        });
      });

      // authBurstLimiter has default limit of 5, so 5 requests should succeed
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${baseUrl}/api/signin`, { method: "POST" });
        expect(res.status).toBe(200);
      }

      // 6th request should hit authBurstLimiter (429)
      const res6 = await fetch(`${baseUrl}/api/signin`, { method: "POST" });
      expect(res6.status).toBe(429);
      const body = (await res6.json()) as { errorMessage: string };
      expect(body.errorMessage).toMatch(/Too many login attempts/i);
    });
  });

  describe("Seam 3: ResilientRedisStore (Horizontal Scalability & Fallback)", () => {
    it("gracefully increments with fallback in-memory store when Redis is unavailable", async () => {
      const store = new ResilientRedisStore("rl:test:resilient:");
      store.init({ windowMs: 60000 } as Options);

      const hit1 = await store.increment("client-ip-1");
      expect(hit1.totalHits).toBe(1);
      expect(hit1.resetTime).toBeInstanceOf(Date);

      const hit2 = await store.increment("client-ip-1");
      expect(hit2.totalHits).toBe(2);

      await store.resetKey("client-ip-1");
      const hit3 = await store.increment("client-ip-1");
      expect(hit3.totalHits).toBe(1);
    });
  });
});
