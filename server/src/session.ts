import { z } from "zod";
import { userRoles } from "./schema";
import crypto from "crypto";
import { getRedisClient, connectRedis, isRedisConnected } from "./utils/redis";
import { CookieOptions, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { disconnect } from "process";

//* Seven days in seconds
const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const COOKIE_SESSION_KEY = "session-id";
const REDIS_SESSION_KEY = "session";
const sessionSchema = z.object({
  userId: z.string(),
  role: z.enum(userRoles),
  username: z.string().min(3),
  email: z.string().email(),
  provider: z.string().optional(),
});

export type UserSession = z.infer<typeof sessionSchema>;

// interface SessionOptions {
//   maxAge?: number;
//   secure?: boolean;
//   httpOnly?: boolean;
//   sameSite?: "strict" | "lax" | "none";
// }

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

export async function getUserFromCookie(req: Request, res: Response) {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    console.log("cookies:", req.cookies);
    return res.status(401).json({ errorMessage: "Please login first" });
  }
  return await getUserSessionFromRedis(sessionId, res);
}

export async function getUserSessionFromRedis(
  sessionId: string,
  res: Response
) {
  try {
    await connectRedis();

    const rawUser = await redisClient.get(`${REDIS_SESSION_KEY}:${sessionId}`);
    console.log("rawUser from Redis", rawUser);

    if (!rawUser) {
      console.log("No session found for sessionId:", sessionId);
      return res
        .status(400)
        .json({ errorMessage: "Session expired or not found" });
    }

    const parsedUser = JSON.parse(rawUser);
    console.log("Parsed User:", parsedUser);
    const { success, data: user } = sessionSchema.safeParse(parsedUser);
    if (!success) console.log("⚠️ safeParse success:", success);
    return success
      ? res.status(200).json(user)
      : res.status(400).json({ errorMessage: "Invalid session data" });
  } catch (error) {
    console.error("Error retrieving user session from Redis:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
}

export async function removeUserSession(req: Request, res: Response) {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];
  if (!sessionId) {
    /// No session ID found in cookies
    return res.status(401).json({
      errorMessage: "No session ID found in cookies. Please login first.",
    });
  }

  try {
    await connectRedis();
    const result = await redisClient.del(`${REDIS_SESSION_KEY}:${sessionId}`);
    console.log("Delete session from redis result:", result);
    res.clearCookie(COOKIE_SESSION_KEY);
  } catch (error) {
    console.error("Error removing user session :", error);
    return res
      .status(500)
      .json({ errorMessage: `Internal server error: ${error}` });
  }
  return res.status(200).json({ message: "Session removed successfully" });
}
