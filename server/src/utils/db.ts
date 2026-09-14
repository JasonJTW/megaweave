// server/src/utils/db.ts

import dotenv from "dotenv";
dotenv.config();
import mysql, { PoolOptions, Pool } from "mysql2";

export type DbPoolConfig = PoolOptions;

export function getDbPoolConfig(
  env: NodeJS.ProcessEnv = process.env,
): DbPoolConfig {
  // Determine which env var is required for this role.
  let limitEnvVar: string;
  let limitRaw: string | undefined;

  if (env.APP_ROLE === "worker") {
    limitEnvVar = "WORKER_DB_CONNECTION_LIMIT";
    limitRaw = env.WORKER_DB_CONNECTION_LIMIT;
  } else if (env.APP_ROLE === "api") {
    limitEnvVar = "API_DB_CONNECTION_LIMIT";
    limitRaw = env.API_DB_CONNECTION_LIMIT;
  } else {
    limitEnvVar = "DB_CONNECTION_LIMIT";
    limitRaw = env.DB_CONNECTION_LIMIT;
  }

  if (!limitRaw) {
    throw new Error(
      `[db] Missing required env var "${limitEnvVar}" (APP_ROLE="${env.APP_ROLE ?? "unset"}"). ` +
        `Set it in your .env file before starting the process.`,
    );
  }

  const parsedLimit = parseInt(limitRaw, 10);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    throw new Error(
      `[db] Invalid value for "${limitEnvVar}": "${limitRaw}". Must be a positive integer.`,
    );
  }

  const connectionLimit = parsedLimit;
  const maxIdle = Math.min(10, connectionLimit);

  return {
    host: env.DB_HOST,
    user: env.DB_USER,
    port: env.DB_PORT ? parseInt(env.DB_PORT, 10) : 3306,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    typeCast: (field, next) => {
      if (field.type === "TINY" && field.length === 1) {
        return field.string() === "1";
      }
      return next();
    },
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    idleTimeout: 300000,
    maxIdle,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 30000,
    timezone: "+00:00", // Force driver to treat DB dates as UTC
  };
}

// ── Lazy singleton pool ───────────────────────────────────────────────────────
// The pool is not created at module-load time. This allows tests to import and
// exercise getDbPoolConfig() in isolation without triggering a real DB connection
// or requiring DB env vars to be present at import time.
let _pool: ReturnType<typeof mysql.createPool> | null = null;
let _monitorInterval: ReturnType<typeof setInterval> | null = null;

function getPool(): ReturnType<typeof mysql.createPool> {
  if (_pool) return _pool;

  const poolConfig = getDbPoolConfig();
  _pool = mysql.createPool(poolConfig);

  // 錯誤處理
  _pool.on("error", (err: unknown) => {
    console.error("Database pool error:", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "PROTOCOL_CONNECTION_LOST"
    ) {
      console.log("Database connection lost, attempting to reconnect...");
    }
  });

  // 監控連接池使用壓力
  const limit = poolConfig.connectionLimit as number; // always set — fail-fast guarantees it
  const warningThreshold = Math.max(1, Math.floor(limit * 0.9));

  _monitorInterval = setInterval(() => {
    if (!_pool) return;
    const pool = _pool as unknown as {
      _allConnections?: unknown[];
      _freeConnections?: unknown[];
      _connectionQueue?: unknown[];
    };
    const total = pool._allConnections?.length ?? 0;
    const free = pool._freeConnections?.length ?? 0;
    const queued = pool._connectionQueue?.length ?? 0;
    const inUse = total - free;

    if (inUse >= warningThreshold || queued > 0) {
      console.warn("⚠️  WARNING: Connection pool under pressure!", {
        inUse,
        limit,
        queued,
      });
    }
  }, 10000);

  if (_monitorInterval.unref) {
    _monitorInterval.unref();
  }

  return _pool;
}

// 優雅關閉連接池
export async function closeDatabase(): Promise<void> {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
  }
  if (_pool) {
    await (_pool as unknown as Pool & { promise(): { end(): Promise<void> } })
      .promise()
      .end();
    _pool = null;
  }
}

// Expose a promise-based proxy so callers can do: `import dbPool from "./db"`
// and use `dbPool.query(...)` as before — the pool is created on first use.
const dbPool = new Proxy({} as ReturnType<ReturnType<typeof mysql.createPool>["promise"]>, {
  get(_target, prop) {
    return (getPool().promise() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default dbPool;
