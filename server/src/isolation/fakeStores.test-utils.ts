// server/src/isolation/fakeStores.test-utils.ts
// 測試用的假資料儲存：只有標記查詢會回應，其他任何操作都會被記錄為寫入。

import type { Pool } from "mysql2/promise";
import type { AppRedisClient } from "../utils/redis";
import type { IsolatedStores } from "./dataStoreGuard";
import type { QueueRedis } from "./resetStores";

export interface FakeStoreOptions {
  mysqlMarker?: { rows?: Record<string, unknown>[]; errorCode?: string };
  cacheMarker?: string | null;
  vectorMarker?: string | null;
  queueMarker?: string | null;
}

const MARKER_READS = new Set([
  "mysql:SELECT marker FROM ??",
  "cache:get",
  "vector:get",
  "queue:get",
]);

export function createFakeStores(options: FakeStoreOptions = {}) {
  const calls: string[] = [];
  const mysqlMarker = options.mysqlMarker ?? { rows: [{ marker: "megaweave-isolated" }] };

  const mysql = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push(`mysql:${sql}`);
      if (sql === "SELECT marker FROM ??" && params?.[0] === "isolated_environment") {
        if (mysqlMarker.errorCode) {
          throw Object.assign(new Error(mysqlMarker.errorCode), { code: mysqlMarker.errorCode });
        }
        return [mysqlMarker.rows ?? [], []];
      }
      return [[], []];
    }),
    getConnection: jest.fn(async () => {
      calls.push("mysql:getConnection");
      throw new Error("unexpected connection");
    }),
  };

  const createRedis = (name: string, marker: string | null | undefined) =>
    new Proxy(
      {},
      {
        get: (_target, prop: string) =>
          jest.fn(async (...args: unknown[]) => {
            calls.push(`${name}:${prop}`);
            if (prop === "get" && args[0] === "isolated:environment") {
              return marker === undefined ? "megaweave-isolated" : marker;
            }
            return null;
          }),
      },
    );

  const stores: IsolatedStores = {
    mysql: mysql as unknown as Pool,
    cacheRedis: createRedis("cache", options.cacheMarker) as AppRedisClient,
    vectorRedis: createRedis("vector", options.vectorMarker) as AppRedisClient,
  };
  const queueRedis = createRedis("queue", options.queueMarker) as QueueRedis;

  const writes = () => calls.filter((call) => !MARKER_READS.has(call));

  return { stores, queueRedis, calls, writes };
}
