// server/src/e2e/seed.ts
// E2E 每次執行前的資料重置：確認隔離標記 → 清空 MySQL 與三個 Redis → 建立測試帳號。
// 標記與清空邏輯沿用 benchmark（dataStoreGuard / resetFixture），production 資料儲存永遠不會通過檢查。

import { randomUUID } from "crypto";
import type Redis from "ioredis";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { BenchmarkSafetyError } from "../benchmark/errors";
import {
  BENCHMARK_DATA_MARKER,
  BENCHMARK_REDIS_MARKER_KEY,
  FixtureStores,
} from "../benchmark/fixture/dataStoreGuard";
import { resetFixture } from "../benchmark/fixture/loadFixture";
import { generateSalt, hashPassword } from "../passwordHasher";

export const e2eUserSchema = z.object({
  E2E_USER_EMAIL: z.email(),
  E2E_USER_PASSWORD: z.string().min(8),
  E2E_USER_NAME: z.string().min(1),
});

export interface E2eUser {
  email: string;
  password: string;
  username: string;
}

export function resolveE2eUser(env: NodeJS.ProcessEnv = process.env): E2eUser {
  const parsed = e2eUserSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid E2E user configuration; load server/e2e.env: ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    email: parsed.data.E2E_USER_EMAIL,
    password: parsed.data.E2E_USER_PASSWORD,
    username: parsed.data.E2E_USER_NAME,
  };
}

/** BullMQ 的 queue Redis 不在 FixtureStores 內，需另外確認標記 */
export async function assertIsolatedQueueRedis(queueRedis: Redis): Promise<void> {
  let marker: string | null;
  try {
    marker = await queueRedis.get(BENCHMARK_REDIS_MARKER_KEY);
  } catch {
    throw new BenchmarkSafetyError("Unable to verify the queue Redis isolation marker");
  }
  if (marker !== BENCHMARK_DATA_MARKER) {
    throw new BenchmarkSafetyError(
      `queue Redis is missing ${BENCHMARK_REDIS_MARKER_KEY}=${BENCHMARK_DATA_MARKER}; refusing to reset a non-isolated instance`,
    );
  }
}

async function resetQueueRedis(queueRedis: Redis): Promise<void> {
  await queueRedis.flushdb();
  await queueRedis.set(BENCHMARK_REDIS_MARKER_KEY, BENCHMARK_DATA_MARKER);
}

/** 與 signup.ts 相同的寫入方式建立 native 登入帳號 */
export async function seedE2eUser(mysql: Pool, user: E2eUser): Promise<number> {
  const salt = generateSalt();
  const hashedPassword = await hashPassword(user.password, salt);
  const [result] = await mysql.query<ResultSetHeader>(
    `INSERT INTO users (username, email, password, salt, providers, role, public_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user.username,
      user.email,
      hashedPassword,
      salt,
      JSON.stringify(["native"]),
      "user",
      randomUUID(),
    ],
  );
  await mysql.query(
    "INSERT INTO user_profiles (user_id, contact_email, custom_name) VALUES (?, ?, ?)",
    [result.insertId, user.email, user.username],
  );
  return result.insertId;
}

/**
 * 所有標記都確認後才開始清空：queue Redis 先檢查，
 * resetFixture 會在寫入前確認 MySQL / cache / vector 標記。
 */
export async function resetAndSeedE2e(
  stores: FixtureStores,
  queueRedis: Redis,
  user: E2eUser,
): Promise<void> {
  await assertIsolatedQueueRedis(queueRedis);
  await resetFixture(stores);
  await resetQueueRedis(queueRedis);
  await seedE2eUser(stores.mysql, user);
}
