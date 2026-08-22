// server/src/utils/db.ts

import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2";

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306;

const dbPool = mysql
  .createPool({
    host: DB_HOST,
    user: DB_USER,
    port: DB_PORT,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    typeCast: (field, next) => {
      if (field.type === "TINY" && field.length === 1) {
        return field.string() === "1";
      }
      return next();
    },
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    idleTimeout: 300000,
    maxIdle: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 30000,
    timezone: "+00:00", // Force driver to treat DB dates as UTC
  })
  .promise();

// 錯誤處理
dbPool.pool.on("error", (err: unknown) => {
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
const monitorInterval = setInterval(() => {
  const pool = dbPool.pool as unknown as {
    _allConnections?: unknown[];
    _freeConnections?: unknown[];
    _connectionQueue?: unknown[];
  };
  const total = pool._allConnections?.length ?? 0;
  const free = pool._freeConnections?.length ?? 0;
  const queued = pool._connectionQueue?.length ?? 0;
  const inUse = total - free;

  if (inUse >= 18 || queued > 0) {
    console.warn("⚠️  WARNING: Connection pool under pressure!", {
      inUse,
      limit: 20,
      queued,
    });
  }
}, 10000);

// 優雅關閉連接池
export async function closeDatabase(): Promise<void> {
  clearInterval(monitorInterval);
  await dbPool.end();
}

export default dbPool;
