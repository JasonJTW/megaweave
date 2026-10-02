// server/src/isolation/dataStoreGuard.ts
// benchmark 與 E2E 會直接清空並寫入 MySQL / Redis，因此每個資料儲存本身都必須帶有隔離標記；
// 標記只由 docker-compose.{benchmark,e2e}.yml 建立，production 資料儲存永遠不會有。

import type { Pool } from "mysql2/promise";
import { RowDataPacket } from "mysql2";
import type { AppRedisClient } from "../utils/redis";
import { IsolationSafetyError } from "./errors";

/** 由 server/db/isolated-marker.sql 與 compose 的 marker job 建立，應用程式本身從不寫入 */
export const ISOLATED_MARKER_TABLE = "isolated_environment";
export const ISOLATED_REDIS_MARKER_KEY = "isolated:environment";
export const ISOLATED_MARKER_VALUE = "megaweave-isolated";

export interface IsolatedStores {
  mysql: Pool;
  cacheRedis: AppRedisClient;
  vectorRedis: AppRedisClient;
}

/** node-redis 與 ioredis（BullMQ queue）共通的最小介面 */
interface MarkerReader {
  get(key: string): Promise<unknown>;
}

export async function assertIsolatedMysql(mysql: Pool): Promise<void> {
  let rows: RowDataPacket[];
  try {
    [rows] = await mysql.query<RowDataPacket[]>(
      "SELECT marker FROM ??",
      [ISOLATED_MARKER_TABLE],
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new IsolationSafetyError(
      code === "ER_NO_SUCH_TABLE"
        ? `MySQL database has no ${ISOLATED_MARKER_TABLE} table; refusing to modify a non-isolated database`
        : `Unable to verify the MySQL isolation marker (${code ?? "unknown error"})`,
    );
  }

  if (rows.length !== 1 || rows[0].marker !== ISOLATED_MARKER_VALUE) {
    throw new IsolationSafetyError(
      `MySQL ${ISOLATED_MARKER_TABLE} does not contain exactly the ${ISOLATED_MARKER_VALUE} marker`,
    );
  }
}

export async function assertIsolatedRedis(
  redis: MarkerReader,
  name: string,
): Promise<void> {
  let marker: string | null;
  try {
    marker = (await redis.get(ISOLATED_REDIS_MARKER_KEY)) as string | null;
  } catch {
    throw new IsolationSafetyError(
      `Unable to verify the ${name} Redis isolation marker`,
    );
  }

  if (marker !== ISOLATED_MARKER_VALUE) {
    throw new IsolationSafetyError(
      `${name} Redis is missing ${ISOLATED_REDIS_MARKER_KEY}=${ISOLATED_MARKER_VALUE}; refusing to modify a non-isolated instance`,
    );
  }
}

export async function assertIsolatedDataStores(
  stores: IsolatedStores,
): Promise<void> {
  await assertIsolatedMysql(stores.mysql);
  await assertIsolatedRedis(stores.cacheRedis, "cache");
  await assertIsolatedRedis(stores.vectorRedis, "vector");
}

function parseRedisVersion(info: string): string {
  return /^redis_version:(.+)$/m.exec(info)?.[1].trim() ?? "unknown";
}

/** 回報實際連線的服務版本，寫入 benchmark 結果以便跨環境比較。 */
export async function describeDataStores(
  stores: IsolatedStores,
): Promise<Record<string, string>> {
  const [[mysqlVersion]] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT VERSION() AS version",
  );
  const [cacheInfo, vectorInfo] = await Promise.all([
    stores.cacheRedis.info("server"),
    stores.vectorRedis.info("server"),
  ]);
  return {
    mysql: String(mysqlVersion.version),
    redisCache: parseRedisVersion(String(cacheInfo)),
    redisVector: parseRedisVersion(String(vectorInfo)),
  };
}
