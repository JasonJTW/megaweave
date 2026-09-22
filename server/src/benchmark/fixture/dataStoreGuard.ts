// server/src/benchmark/fixture/dataStoreGuard.ts
// Fixture 會直接清空並寫入 MySQL / Redis，因此除了 API 的 /health 標記外，
// 每個資料儲存本身也必須帶有 benchmark 標記；production 資料庫永遠不會有這些標記。

import type { Pool } from "mysql2/promise";
import { RowDataPacket } from "mysql2";
import type { AppRedisClient } from "../../utils/redis";
import { BenchmarkSafetyError } from "../errors";
import { BENCHMARK_TARGET_MARKER_VALUE } from "../targetMarker";

/** 由 docker-compose.benchmark.yml 的初始化腳本建立，應用程式本身從不寫入 */
export const BENCHMARK_MARKER_TABLE = "benchmark_environment";
export const BENCHMARK_REDIS_MARKER_KEY = "benchmark:environment";
export const BENCHMARK_DATA_MARKER = BENCHMARK_TARGET_MARKER_VALUE;

export interface FixtureStores {
  mysql: Pool;
  cacheRedis: AppRedisClient;
  vectorRedis: AppRedisClient;
}

export async function assertBenchmarkMysql(mysql: Pool): Promise<void> {
  let rows: RowDataPacket[];
  try {
    [rows] = await mysql.query<RowDataPacket[]>(
      "SELECT marker FROM ??",
      [BENCHMARK_MARKER_TABLE],
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new BenchmarkSafetyError(
      code === "ER_NO_SUCH_TABLE"
        ? `MySQL database has no ${BENCHMARK_MARKER_TABLE} table; refusing to modify a non-benchmark database`
        : `Unable to verify the MySQL benchmark marker (${code ?? "unknown error"})`,
    );
  }

  if (rows.length !== 1 || rows[0].marker !== BENCHMARK_DATA_MARKER) {
    throw new BenchmarkSafetyError(
      `MySQL ${BENCHMARK_MARKER_TABLE} does not contain exactly the ${BENCHMARK_DATA_MARKER} marker`,
    );
  }
}

async function assertBenchmarkRedis(
  redis: AppRedisClient,
  name: string,
): Promise<void> {
  let marker: string | null;
  try {
    marker = (await redis.get(BENCHMARK_REDIS_MARKER_KEY)) as string | null;
  } catch {
    throw new BenchmarkSafetyError(
      `Unable to verify the ${name} Redis benchmark marker`,
    );
  }

  if (marker !== BENCHMARK_DATA_MARKER) {
    throw new BenchmarkSafetyError(
      `${name} Redis is missing ${BENCHMARK_REDIS_MARKER_KEY}=${BENCHMARK_DATA_MARKER}; refusing to modify a non-benchmark instance`,
    );
  }
}

export async function assertBenchmarkDataStores(
  stores: FixtureStores,
): Promise<void> {
  await assertBenchmarkMysql(stores.mysql);
  await assertBenchmarkRedis(stores.cacheRedis, "cache");
  await assertBenchmarkRedis(stores.vectorRedis, "vector");
}

function parseRedisVersion(info: string): string {
  return /^redis_version:(.+)$/m.exec(info)?.[1].trim() ?? "unknown";
}

/** 回報實際連線的服務版本，寫入 benchmark 結果以便跨環境比較。 */
export async function describeDataStores(
  stores: FixtureStores,
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
