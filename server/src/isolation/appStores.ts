// server/src/isolation/appStores.ts

import type { Pool } from "mysql2/promise";
import type { IsolatedStores } from "./dataStoreGuard";

export interface AppStores extends IsolatedStores {
  connectRedis(): Promise<void>;
  close(): Promise<void>;
}

/**
 * 以目前載入的 env（benchmark.env / e2e.env）連線到應用程式的 MySQL / Redis；
 * 呼叫端須在寫入前確認資料儲存標記。模組延遲載入，避免 import 時就建立連線。
 */
export async function openAppStores(): Promise<AppStores> {
  const db = await import("../utils/db");
  const redis = await import("../utils/redis");
  return {
    mysql: db.default as unknown as Pool,
    cacheRedis: redis.cacheRedisClient,
    vectorRedis: redis.vectorRedisClient,
    connectRedis: redis.connectRedis,
    close: async () => {
      await redis.disconnectRedis();
      await db.closeDatabase();
    },
  };
}
