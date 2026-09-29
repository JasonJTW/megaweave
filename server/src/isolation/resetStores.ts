// server/src/isolation/resetStores.ts
// 清空隔離環境（benchmark / E2E）的 MySQL 與 Redis：所有標記確認後才會寫入，參考資料與標記保留。

import { RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import {
  createPostVectorIndex,
  POST_VECTOR_INDEX,
} from "../services/vectorIndexService";
import type { AppRedisClient } from "../utils/redis";
import {
  assertIsolatedDataStores,
  assertIsolatedRedis,
  ISOLATED_MARKER_TABLE,
  ISOLATED_MARKER_VALUE,
  ISOLATED_REDIS_MARKER_KEY,
  IsolatedStores,
} from "./dataStoreGuard";

/** 參考資料由 reference-data.sql 匯入，reset 時保留 */
const PRESERVED_TABLES = new Set(["categories", "conditions", ISOLATED_MARKER_TABLE]);

/** BullMQ 使用的 ioredis client 需要的最小介面 */
export interface QueueRedis {
  get(key: string): Promise<string | null>;
  flushdb(): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
}

async function resetMysql(mysql: Pool): Promise<void> {
  const connection = await mysql.getConnection();
  try {
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    );
    // TRUNCATE 需暫停外鍵檢查；僅作用於此連線
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of tables) {
      if (!PRESERVED_TABLES.has(name as string)) {
        await connection.query("TRUNCATE TABLE ??", [name]);
      }
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    connection.release();
  }
}

async function resetRedis(redis: AppRedisClient): Promise<void> {
  await redis.flushDb();
  await redis.set(ISOLATED_REDIS_MARKER_KEY, ISOLATED_MARKER_VALUE);
}

async function dropPostVectorIndex(redis: AppRedisClient): Promise<void> {
  try {
    await redis.sendCommand(["FT.DROPINDEX", POST_VECTOR_INDEX]);
  } catch (error) {
    const message = String((error as Error)?.message ?? error).toLowerCase();
    if (!message.includes("unknown index") && !message.includes("not found")) throw error;
  }
}

/**
 * 清空隔離資料儲存並重建空的向量索引。
 * 傳入 queueRedis 時一併清空 BullMQ queue；任何一個標記不符都不會寫入。
 */
export async function resetIsolatedStores(
  stores: IsolatedStores,
  queueRedis?: QueueRedis,
): Promise<void> {
  await assertIsolatedDataStores(stores);
  if (queueRedis) await assertIsolatedRedis(queueRedis, "queue");

  await dropPostVectorIndex(stores.vectorRedis);
  await resetMysql(stores.mysql);
  await resetRedis(stores.cacheRedis);
  await resetRedis(stores.vectorRedis);
  if (queueRedis) {
    await queueRedis.flushdb();
    await queueRedis.set(ISOLATED_REDIS_MARKER_KEY, ISOLATED_MARKER_VALUE);
  }
  await createPostVectorIndex(stores.vectorRedis);
}
