import { z } from "zod";
import { userRoles, UserSession } from "./schema";
import crypto from "crypto";
import { getRedisClient, connectRedis, isRedisConnected } from "./utils/redis";
import { CookieOptions, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { disconnect } from "process";
import { sessionSchema } from "./schema";
import dotenv from "dotenv";
dotenv.config();

//* Seven days in seconds
const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_SESSION_KEY = process.env.COOKIE_SESSION_KEY!;
const REDIS_SESSION_KEY = process.env.REDIS_SESSION_KEY!;

if (!COOKIE_SESSION_KEY || !REDIS_SESSION_KEY) {
  throw new Error(
    "Missing required environment variables: COOKIE_SESSION_KEY or REDIS_SESSION_KEY"
  );
}

const redisClient = getRedisClient();

// ✅ 自定義錯誤類別
export class SessionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SessionError";
  }
}

export class RedisConnectionError extends SessionError {
  constructor(message: string = "Failed to connect to Redis") {
    super(message, "REDIS_CONNECTION_ERROR");
    this.name = "RedisConnectionError";
  }
}

export class UpdateSessionError extends SessionError {
  constructor(message: string) {
    super(message, "UPDATE_SESSION_ERROR");
    this.name = "UpdateSessionError";
  }
}

function setCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    maxAge: SESSION_EXPIRATION_SECONDS * 1000,
    expires: new Date(Date.now() + SESSION_EXPIRATION_SECONDS * 1000),
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

// ✅ Redis 連線檢查輔助函數
async function ensureRedisConnection(): Promise<void> {
  try {
    await connectRedis();
    if (!isRedisConnected()) {
      throw new RedisConnectionError("Redis client is not connected");
    }
  } catch (error) {
    console.error("Redis connection failed:", error);
    throw new RedisConnectionError(
      error instanceof Error ? error.message : "Unknown Redis error"
    );
  }
}

export async function createUserSession(
  user: UserSession,
  req: Request,
  res: Response
) {
  try {
    // ✅ 檢查 Redis 連線
    await ensureRedisConnection();

    const sessionId = crypto.randomBytes(512).toString("hex").normalize();
    const sessionData = JSON.stringify(sessionSchema.parse(user));

    //* Store session data in Redis with an expiration time
    await redisClient.setEx(
      `${REDIS_SESSION_KEY}:${sessionId}`,
      SESSION_EXPIRATION_SECONDS,
      sessionData
    );

    //* Store session ID in cookie
    setCookie(res, COOKIE_SESSION_KEY, sessionId);
    return sessionId;
  } catch (error) {
    console.error("Error creating user session:", error);

    // ✅ 重新拋出特定錯誤
    if (error instanceof RedisConnectionError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new SessionError("Invalid user session data", "VALIDATION_ERROR");
    }

    throw new SessionError(
      "Failed to create user session",
      "CREATE_SESSION_ERROR"
    );
  }
}

export async function removeUserSession(req: Request, res: Response) {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    throw new SessionError("No session ID found in cookies", "NO_SESSION_ID");
  }

  try {
    // ✅ 檢查 Redis 連線
    await ensureRedisConnection();

    const result = await redisClient.del(`${REDIS_SESSION_KEY}:${sessionId}`);
    console.log("Delete session from redis result:", result);

    res.clearCookie(COOKIE_SESSION_KEY);
    return res.status(200).json({ message: "Session removed successfully" });
  } catch (error) {
    console.error("Error removing user session:", error);

    // ✅ 處理不同類型的錯誤
    if (error instanceof RedisConnectionError) {
      return res.status(503).json({
        errorMessage: "Database temporarily unavailable",
      });
    }

    return res.status(500).json({
      errorMessage: "Failed to remove session",
    });
  }
}

export async function getUserSessionFromRedis(
  sessionId: string
): Promise<UserSession | null> {
  try {
    // ✅ 檢查 Redis 連線
    await ensureRedisConnection();

    const rawUser = await redisClient.get(`${REDIS_SESSION_KEY}:${sessionId}`);

    if (!rawUser) {
      return null;
    }

    const parsedUser = JSON.parse(rawUser);
    const { success, data: user } = sessionSchema.safeParse(parsedUser);

    if (!success) {
      console.error("Invalid session data format in Redis");
      return null;
    }

    console.log("Redis session user:", user);
    return user;
  } catch (error) {
    console.error("Error retrieving user session:", error);

    // ✅ Redis 連線錯誤時返回 null，讓上層處理
    if (error instanceof RedisConnectionError) {
      console.error("Redis connection failed, treating as no session");
      return null;
    }

    return null;
  }
}

export async function getUserFromCookie(
  req: Request
): Promise<UserSession | null> {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    return null;
  }

  try {
    return await getUserSessionFromRedis(sessionId);
  } catch (error) {
    console.error("Error getting user from cookie:", error);
    return null;
  }
}

export async function updateUserSession(
  req: Request,
  updates: Partial<UserSession>
): Promise<UserSession | null> {
  try {
    const sessionId = req.cookies[COOKIE_SESSION_KEY];
    if (!sessionId) {
      throw new UpdateSessionError("No session ID found in cookies");
    }

    // ✅ 檢查 Redis 連線
    await ensureRedisConnection();

    const key = `${REDIS_SESSION_KEY}:${sessionId}`;
    const raw = await redisClient.get(key);

    if (!raw) {
      throw new UpdateSessionError("Session not found in Redis");
    }

    const parsed = JSON.parse(raw);

    //* Merge existing session data with updates
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    const updated = { ...parsed, ...filteredUpdates };

    //* Zod validation
    const validated = sessionSchema.parse(updated);

    const ttl = await redisClient.ttl(key);
    if (ttl && ttl > 0) {
      await redisClient.setEx(key, ttl, JSON.stringify(validated));
    } else {
      await redisClient.setEx(
        key,
        SESSION_EXPIRATION_SECONDS,
        JSON.stringify(validated)
      );
    }

    console.log("Updated session data:", validated);
    return validated;
  } catch (error) {
    // ✅ 詳細的錯誤處理
    if (error instanceof RedisConnectionError) {
      console.error("Redis connection failed during session update");
      throw error;
    }

    if (error instanceof z.ZodError) {
      console.error("Session validation error:", error.issues);
      throw new UpdateSessionError("Invalid session data");
    }

    if (error instanceof UpdateSessionError) {
      throw error;
    }

    console.error("UpdateUserSession failed:", error);
    throw new UpdateSessionError(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
