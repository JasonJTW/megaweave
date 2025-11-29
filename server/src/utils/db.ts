// server/src/utils/db.ts

import dotenv from "dotenv";
dotenv.config();
import mysql, { RowDataPacket } from "mysql2";

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
  })
  .promise();

// 連接池事件監聽
dbPool.on("connection", (connection) => {
  console.log("New connection established as id " + connection.threadId);
});

dbPool.on("acquire", (connection) => {
  console.log("Connection %d acquired", connection.threadId);
});

dbPool.on("release", (connection) => {
  console.log("Connection %d released", connection.threadId);
});

dbPool.on("enqueue", () => {
  console.log("Waiting for available connection slot");
});

// 錯誤處理
const poolConnection = dbPool.pool;
poolConnection.on("error", (err: any) => {
  console.error("Database pool error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("Database connection lost, attempting to reconnect...");
  }
});

// ✅ 新增：監控連接池狀態
const monitorInterval = setInterval(() => {
  try {
    const pool = dbPool.pool as any; // 需要訪問內部屬性
    const allConnections = pool._allConnections?.length || 0;
    const freeConnections = pool._freeConnections?.length || 0;
    const queueLength = pool._connectionQueue?.length || 0;
    const inUse = allConnections - freeConnections;

    const status = {
      timestamp: new Date().toISOString(),
      total: allConnections,
      free: freeConnections,
      inUse: inUse,
      queued: queueLength,
      utilizationRate:
        allConnections > 0
          ? ((inUse / allConnections) * 100).toFixed(1) + "%"
          : "0%",
    };

    console.log("📊 Pool Status:", status);

    // ⚠️ 警告：如果使用率過高或有排隊，發出警告
    if (inUse >= 18 || queueLength > 0) {
      console.warn("⚠️  WARNING: Connection pool under pressure!", {
        inUse,
        limit: 20,
        queued: queueLength,
      });
    }
  } catch (error) {
    console.error("Error monitoring pool:", error);
  }
}, 10000); // 每 10 秒

// 優雅關閉連接池
export async function closeDatabase(): Promise<void> {
  console.log("📍 Closing database pool...");

  // 停止監控
  clearInterval(monitorInterval);

  try {
    // 最後一次報告狀態
    const pool = dbPool.pool as any;
    console.log("Final pool status:", {
      total: pool._allConnections?.length || 0,
      free: pool._freeConnections?.length || 0,
      inUse:
        (pool._allConnections?.length || 0) -
        (pool._freeConnections?.length || 0),
      queued: pool._connectionQueue?.length || 0,
    });

    await dbPool.end();
    console.log("✅ Database pool closed successfully");
  } catch (error) {
    console.error("❌ Error closing database pool:", error);
    throw error;
  }
}

export default dbPool;
