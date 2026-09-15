import rateLimit, {
  Store,
  Options,
  MemoryStore,
  ClientRateLimitInfo,
  IncrementResponse,
  RateLimitRequestHandler,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Request, Response, NextFunction } from "express";
import { cacheRedisClient } from "../utils/redis";

/**
 * Resilient Redis Store for express-rate-limit.
 *
 * Provides horizontal scalability across distributed Node.js instances
 * by storing rate limit counters in shared Redis.
 * If Redis is not connected, fails, or is unavailable (e.g. local unit tests or network blips),
 * it gracefully falls back to an in-memory store without breaking requests or throwing 500s.
 */
export class ResilientRedisStore implements Store {
  private memoryStore: MemoryStore;
  private redisStore: RedisStore | null = null;
  private options?: Options;
  public readonly prefix: string;
  public readonly localKeys: boolean = false;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.memoryStore = new MemoryStore();
  }

  init(options: Options): void {
    this.options = options;
    this.memoryStore.init(options);
    if (this.redisStore) {
      this.redisStore.init(options);
    }
  }

  private getRedisStore(): RedisStore | null {
    if (this.redisStore) {
      return this.redisStore;
    }
    if (cacheRedisClient && cacheRedisClient.isOpen && cacheRedisClient.isReady) {
      try {
        this.redisStore = new RedisStore({
          sendCommand: (...args: string[]) => cacheRedisClient.sendCommand(args),
          prefix: this.prefix,
        });
        if (this.options) {
          this.redisStore.init(this.options);
        }
      } catch (err) {
        console.warn(`[RateLimit] Failed to instantiate RedisStore for prefix ${this.prefix}:`, err);
        this.redisStore = null;
      }
    }
    return this.redisStore;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const redis = this.getRedisStore();
    if (redis && typeof redis.get === "function") {
      try {
        return await redis.get(key);
      } catch (err) {
        console.warn(`[RateLimit] Redis get failed for prefix ${this.prefix}, falling back to memory:`, err);
      }
    }
    return this.memoryStore.get(key);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = this.getRedisStore();
    if (redis) {
      try {
        return await redis.increment(key);
      } catch (err) {
        console.warn(`[RateLimit] Redis increment failed for prefix ${this.prefix}, falling back to memory:`, err);
      }
    }
    return this.memoryStore.increment(key);
  }

  async decrement(key: string): Promise<void> {
    const redis = this.getRedisStore();
    if (redis) {
      try {
        await redis.decrement(key);
      } catch (err) {
        console.warn(`[RateLimit] Redis decrement failed for prefix ${this.prefix}:`, err);
      }
    }
    return this.memoryStore.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    const redis = this.getRedisStore();
    if (redis) {
      try {
        await redis.resetKey(key);
      } catch (err) {
        console.warn(`[RateLimit] Redis resetKey failed for prefix ${this.prefix}:`, err);
      }
    }
    return this.memoryStore.resetKey(key);
  }

  async resetAll(): Promise<void> {
    const redis = this.getRedisStore() as any;
    if (redis && typeof redis.resetAll === "function") {
      try {
        await redis.resetAll();
      } catch (err) {
        console.warn(`[RateLimit] Redis resetAll failed for prefix ${this.prefix}:`, err);
      }
    }
    return this.memoryStore.resetAll();
  }

  async shutdown(): Promise<void> {
    const redis = this.getRedisStore() as any;
    if (redis && typeof redis.shutdown === "function") {
      try {
        await redis.shutdown();
      } catch {
        // ignore
      }
    }
    if (typeof this.memoryStore.shutdown === "function") {
      await this.memoryStore.shutdown();
    }
  }
}

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  prefix: string;
  errorMessage: string;
  bypassInDev?: boolean;
  bypassInTest?: boolean;
  statusCode?: number;
}

/**
 * Creates a rate limiting middleware with standard 429 response, Retry-After headers,
 * distributed Redis store, and configurable development/test environment bypass.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimitRequestHandler {
  const store = new ResilientRedisStore(options.prefix);

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true, // Adds RateLimit-* and Retry-After headers
    legacyHeaders: false,  // Disables deprecated X-RateLimit-* headers
    store,
    statusCode: options.statusCode || 429,
    message: {
      errorMessage: options.errorMessage,
    },
    handler: (_req: Request, res: Response, _next: NextFunction, opts) => {
      res.status(opts.statusCode).json(opts.message);
    },
    skip: () => {
      if (process.env.RATE_LIMIT_DISABLED === "true") {
        return true;
      }
      if (
        options.bypassInDev !== false &&
        process.env.NODE_ENV === "development" &&
        process.env.ENABLE_RATE_LIMIT_DEV !== "true"
      ) {
        return true;
      }
      if (
        options.bypassInTest !== false &&
        process.env.NODE_ENV === "test" &&
        process.env.ENABLE_RATE_LIMIT_TEST !== "true"
      ) {
        return true;
      }
      return false;
    },
  });
}

// 1. Global general limiter (120 req / 1 min by default)
export const globalRateLimiter = createRateLimiter({
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 120),
  prefix: "rl:global:",
  errorMessage: "Too many requests from this IP, please try again later.",
  bypassInDev: true,
  bypassInTest: true,
});

// 2. Auth routes - Tier 1: Burst limiter (5 req / 10 sec by default)
export const authBurstLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_BURST_RATE_LIMIT_WINDOW_MS || 10 * 1000),
  limit: Number(process.env.AUTH_BURST_RATE_LIMIT_MAX || 5),
  prefix: "rl:auth:burst:",
  errorMessage: "Too many login attempts. Please slow down and try again.",
  bypassInDev: true,
  bypassInTest: true,
});

// 3. Auth routes - Tier 2: Sustained limiter (10 req / 1 min by default)
export const authSustainedLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  prefix: "rl:auth:sustained:",
  errorMessage: "Too many login attempts from this IP, please try again after 1 minute.",
  bypassInDev: true,
  bypassInTest: true,
});

// Combined tiered middleware for auth endpoints
export const authRateLimiter: RateLimitRequestHandler[] = [
  authBurstLimiter,
  authSustainedLimiter,
];
