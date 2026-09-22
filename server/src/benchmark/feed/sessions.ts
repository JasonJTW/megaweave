// server/src/benchmark/feed/sessions.ts
// 為 fixture 使用者直接在 benchmark cache Redis 建立登入 session，讓虛擬使用者走真實的 cookie 驗證路徑，
// 而不必經過登入 API（fixture 使用者沒有密碼，登入也不是本 benchmark 的量測對象）。

import { randomBytes } from "crypto";
import type { AppRedisClient } from "../../utils/redis";
import { sessionSchema } from "../../schema";

/** 與 session.ts 相同的環境變數與預設值；benchmark.env 明確設定兩者，確保 runner 與 API 一致 */
export const sessionCookieName = () => process.env.COOKIE_SESSION_KEY || "session-id";
const redisSessionPrefix = () => process.env.REDIS_SESSION_KEY || "session";
const SESSION_TTL_SECONDS = 24 * 60 * 60;

export interface SessionUser {
  id: number;
  public_id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: Date;
}

export async function createBenchmarkSessions(
  cacheRedis: AppRedisClient,
  users: readonly SessionUser[],
): Promise<string[]> {
  const sessionIds: string[] = [];
  for (const user of users) {
    const sessionId = randomBytes(32).toString("hex");
    const session = sessionSchema.parse({
      userId: user.id,
      role: "user",
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      public_id: user.public_id,
      joined_at: user.created_at,
    });
    await cacheRedis.setEx(`${redisSessionPrefix()}:${sessionId}`, SESSION_TTL_SECONDS, JSON.stringify(session));
    sessionIds.push(sessionId);
  }
  return sessionIds;
}

export async function deleteBenchmarkSessions(
  cacheRedis: AppRedisClient,
  sessionIds: readonly string[],
): Promise<void> {
  if (sessionIds.length === 0) return;
  await cacheRedis.del(sessionIds.map((id) => `${redisSessionPrefix()}:${id}`));
}
