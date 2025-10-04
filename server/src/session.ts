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

export async function createUserSession(
  user: UserSession,
  req: Request,
  res: Response
  // options: SessionOptions = {},
) {
  await connectRedis();

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
}

export async function removeUserSession(req: Request, res: Response) {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    /// No session ID found in cookies
    throw new Error("No session ID found in cookies");
  }

  try {
    await connectRedis();
    const result = await redisClient.del(`${REDIS_SESSION_KEY}:${sessionId}`);
    console.log("Delete session from redis result:", result);
    res.clearCookie(COOKIE_SESSION_KEY);
    return res.status(200).json({ message: "Session removed successfully" });
  } catch (error) {
    console.error("Error removing user session :", error);
    throw error;
  }
}

export async function getUserSessionFromRedis(
  sessionId: string
): Promise<UserSession | null> {
  try {
    await connectRedis();
    const redisClient = getRedisClient();

    const rawUser = await redisClient.get(`${REDIS_SESSION_KEY}:${sessionId}`);

    if (!rawUser) {
      return null;
    }

    const parsedUser = JSON.parse(rawUser);
    const { success, data: user } = sessionSchema.safeParse(parsedUser);
    console.log("Redis session user:", user);
    return success ? user : null;
  } catch (error) {
    console.error("Error retrieving user session:", error);
    return null;
  }
}

// 重構後的 session.ts 中的函數，移除直接的 Response 操作
export async function getUserFromCookie(
  req: Request
): Promise<UserSession | null> {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    return null;
  }

  return await getUserSessionFromRedis(sessionId);
}

export class UpdateSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateSessionError";
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

    await connectRedis();
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
    if (error instanceof z.ZodError) {
      console.error("Session validation error:", error.message);
      throw new UpdateSessionError("Invalid session data");
    }
    console.error("UpdateUserSession failed: ", error);
    return null;
  }
}
