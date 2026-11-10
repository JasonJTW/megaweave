import { z } from "zod";
import { UserSession } from "./schema";
import crypto from "crypto";
import { getCacheRedisClient, connectRedis, isRedisConnected } from "./utils/redis";
import { CookieOptions, Request, Response } from "express";
import { sessionSchema } from "./schema";
import dotenv from "dotenv";
dotenv.config();

const DAY_SECONDS = 60 * 60 * 24;
//* 閒置逾時：14 天沒用就失效；用過一半（7 天）之後再使用就續成從現在起 14 天
const IDLE_TIMEOUT_SECONDS = DAY_SECONDS * 14;
const RENEW_AFTER_MS = (IDLE_TIMEOUT_SECONDS / 2) * 1000;
//* 絕對逾時：不管多常使用，登入滿 30 天就要重新登入（續期不會超過這個期限）
const ABSOLUTE_TIMEOUT_MS = DAY_SECONDS * 30 * 1000;
const COOKIE_SESSION_KEY = process.env.COOKIE_SESSION_KEY || "session-id";
const REDIS_SESSION_KEY = process.env.REDIS_SESSION_KEY || "session";
const ROLE_SESSION_KEY = process.env.ROLE_SESSION_KEY || "user-role";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN!;

//* userId → 這個 user 所有 sessionId 的 Redis Set，讓改 role 這類操作不用 SCAN 整個 Redis。
//* 成員可能指向已過期的 session，讀的時候順手清掉。
const userSessionsKey = (userId: number) => `user-sessions:${userId}`;

if (
  !process.env.COOKIE_SESSION_KEY ||
  !process.env.REDIS_SESSION_KEY ||
  !process.env.ROLE_SESSION_KEY
) {
  console.warn(
    "⚠️ Warning: Some session-related environment variables are missing. Using default values.",
  );
}

const redisClient = getCacheRedisClient();

// ✅ 自定義錯誤類別
export class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
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

function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
) {
  res.cookie(name, value, {
    maxAge: maxAgeSeconds * 1000,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
  });
}

// 供 Middleware 讀取的 role cookie (httpOnly: false 以便伺服器端 Edge Runtime 讀取)
// 不含敏感資料，真正的身份驗證仍由 Redis session 處理
function setRoleCookie(res: Response, role: string, maxAgeSeconds: number) {
  res.cookie("user-role", role, {
    maxAge: maxAgeSeconds * 1000,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
    secure: true,
    httpOnly: false, // Middleware (Edge Runtime) 需要能讀取這個 Cookie
    sameSite: "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
  });
}

function setSessionCookies(
  res: Response,
  sessionId: string,
  role: string,
  maxAgeSeconds: number,
) {
  //* Store session ID in cookie
  setCookie(res, COOKIE_SESSION_KEY, sessionId, maxAgeSeconds);
  //* Store role in a separate cookie for Middleware to read without API call
  setRoleCookie(res, role, maxAgeSeconds);
}

//* Redis 裡存的是 user 欄位加上續期用的時間戳（epoch ms）；sessionSchema 會濾掉時間戳，
//* 所以 req.user 和 /api/currentUser 的回應不會帶出這些欄位
const sessionMetaSchema = z.object({
  createdAt: z.number(),
  renewedAt: z.number(),
});
type SessionMeta = z.infer<typeof sessionMetaSchema>;
type StoredSession = UserSession & SessionMeta;

async function addToUserIndex(userId: number, sessionId: string) {
  const indexKey = userSessionsKey(userId);
  await redisClient.sAdd(indexKey, sessionId);
  //* 每個成員最多活到它登入後 30 天，所以 index 在最後一次加入後 30 天也就沒用了
  await redisClient.expire(indexKey, ABSOLUTE_TIMEOUT_MS / 1000);
}

//* 把 updates 合併進一筆 Redis 裡的 session，保留續期時間戳；資料無效時丟 ZodError
function mergeSession(parsed: unknown, updates: Partial<UserSession>) {
  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );
  const validated = sessionSchema.parse({
    ...(parsed as object),
    ...filteredUpdates,
  });
  //* sessionSchema 會濾掉續期時間戳，要帶回去，否則 session 會被當成無效
  const meta = sessionMetaSchema.partial().parse(parsed);
  return { validated, stored: JSON.stringify({ ...validated, ...meta }) };
}

/**
 * 把 updates 寫進某個 user 在所有裝置上的 session（例如改完 DB 的 role 之後同步），
 * 到期時間不變。回傳實際更新了幾個 session。
 */
export async function updateSessionsForUser(
  userId: number,
  updates: Partial<UserSession>,
): Promise<number> {
  await ensureRedisConnection();
  const indexKey = userSessionsKey(userId);
  let updated = 0;
  for (const sessionId of await redisClient.sMembers(indexKey)) {
    const key = `${REDIS_SESSION_KEY}:${sessionId}`;
    const raw = await redisClient.get(key);
    if (!raw) {
      await redisClient.sRem(indexKey, sessionId);
      continue;
    }
    const { stored } = mergeSession(JSON.parse(raw), updates);
    await redisClient.set(key, stored, { KEEPTTL: true });
    updated += 1;
  }
  return updated;
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
      error instanceof Error ? error.message : "Unknown Redis error",
    );
  }
}

export async function createUserSession(
  user: UserSession,
  _req: Request,
  res: Response,
) {
  try {
    // ✅ 檢查 Redis 連線
    await ensureRedisConnection();

    const sessionId = crypto.randomBytes(512).toString("hex").normalize();
    const now = Date.now();
    const sessionData = JSON.stringify({
      ...sessionSchema.parse(user),
      createdAt: now,
      renewedAt: now,
    } satisfies StoredSession);

    //* Store session data in Redis with an expiration time
    await redisClient.setEx(
      `${REDIS_SESSION_KEY}:${sessionId}`,
      IDLE_TIMEOUT_SECONDS,
      sessionData,
    );

    await addToUserIndex(user.userId, sessionId);

    setSessionCookies(res, sessionId, user.role, IDLE_TIMEOUT_SECONDS);
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
      "CREATE_SESSION_ERROR",
    );
  }
}

const clearCookieOptions: CookieOptions = {
  path: "/",
  domain: COOKIE_DOMAIN,
  secure: true,
  sameSite: "lax",
};

function clearSessionCookies(res: Response) {
  res.clearCookie(COOKIE_SESSION_KEY, clearCookieOptions);
  res.clearCookie(ROLE_SESSION_KEY, clearCookieOptions);
}

export async function removeUserSession(req: Request, res: Response) {
  const sessionId = req.cookies[COOKIE_SESSION_KEY];

  try {
    if (sessionId) {
      // ✅ 檢查 Redis 連線
      await ensureRedisConnection();
      const result = await redisClient.del(`${REDIS_SESSION_KEY}:${sessionId}`);
      console.log("Delete session from redis result:", result);
    }

    // ✅ 清除所有相關 Cookies
    clearSessionCookies(res);
  } catch (error) {
    console.error("Error removing user session:", error);
    // 即使 Redis 刪除失敗，也至少嘗試清除 Cookies
    clearSessionCookies(res);
    throw error; // 丟出錯誤讓呼叫者處理 Response
  }
}

export async function getUserSessionFromRedis(
  sessionId: string,
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
      console.error("rawUser: ", rawUser);
      console.error("parsedUser: ", parsedUser);
      return null;
    }

    // console.log("Redis session user:", user);
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
  req: Request,
): Promise<UserSession | null> {
  return getUserFromCookies(req.cookies);
}

//* 不依賴 Express Request 的版本，供 Socket.IO handshake 等非 HTTP route 使用
export async function getUserFromCookies(
  cookies: Record<string, string | undefined> | undefined,
): Promise<UserSession | null> {
  const sessionId = cookies?.[COOKIE_SESSION_KEY];
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

/**
 * 給 auth middleware 用的 session 驗證：除了讀 session，也負責讓瀏覽器 cookie 跟 Redis 保持一致。
 * 瀏覽器帶著 session-id、Redis 卻沒有這個 session 時清掉 cookie，否則 Next middleware
 * 只看 cookie 會一直以為已登入（/signin 被導回首頁）。
 */
export async function authenticateRequest(
  req: Request,
  res: Response,
): Promise<UserSession | null> {
  const sessionId = req.cookies?.[COOKIE_SESSION_KEY];
  if (!sessionId) {
    return null;
  }

  const key = `${REDIS_SESSION_KEY}:${sessionId}`;
  //* Redis 連不上時往上丟 RedisConnectionError，不清 cookie：暫時故障不該把所有人登出
  await ensureRedisConnection();
  try {
    const raw = await redisClient.get(key);
    const stored = raw ? parseStoredSession(raw) : null;
    if (!stored) {
      clearSessionCookies(res);
      return null;
    }

    const { user, meta, legacy } = stored;
    if (legacy) {
      await addToUserIndex(user.userId, sessionId);
    }
    const now = Date.now();
    const renew = now - meta.renewedAt >= RENEW_AFTER_MS;
    const expiresAt = Math.min(
      (renew ? now : meta.renewedAt) + IDLE_TIMEOUT_SECONDS * 1000,
      meta.createdAt + ABSOLUTE_TIMEOUT_MS,
    );
    const ttlSeconds = Math.floor((expiresAt - now) / 1000);
    if (ttlSeconds <= 0) {
      await redisClient.del(key);
      clearSessionCookies(res);
      return null;
    }

    if (renew) {
      const renewed: StoredSession = { ...user, ...meta, renewedAt: now };
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(renewed));
      setSessionCookies(res, sessionId, user.role, ttlSeconds);
    } else if (req.cookies?.["user-role"] !== user.role) {
      //* role 改過（或 cookie 被竄改）時讓 Next middleware 看到的 role 跟 session 一致
      setRoleCookie(res, user.role, ttlSeconds);
    }
    return user;
  } catch (error) {
    throw new RedisConnectionError(
      error instanceof Error ? error.message : "Unknown Redis error",
    );
  }
}

function parseStoredSession(
  raw: string,
): { user: UserSession; meta: SessionMeta; legacy: boolean } | null {
  try {
    const json = JSON.parse(raw);
    const user = sessionSchema.safeParse(json);
    const meta = sessionMetaSchema.partial().safeParse(json);
    if (!user.success || !meta.success) return null;
    //* 部署前建立的舊 session 沒有時間戳：當作現在登入，並讓 renewedAt = 0 立刻觸發續期把時間戳寫回去
    const legacy = meta.data.createdAt === undefined;
    const { createdAt = Date.now(), renewedAt = 0 } = meta.data;
    return { user: user.data, meta: { createdAt, renewedAt }, legacy };
  } catch {
    return null;
  }
}

export async function updateUserSession(
  req: Request,
  updates: Partial<UserSession>,
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

    //* Merge existing session data with updates（Zod 驗證）；KEEPTTL 讓更新內容不影響到期時間
    const { validated, stored } = mergeSession(JSON.parse(raw), updates);
    await redisClient.set(key, stored, { KEEPTTL: true });

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
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
