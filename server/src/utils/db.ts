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
    waitForConnections: true,
    connectionLimit: 10, // 最大連接數
    queueLimit: 0, // 無限制排隊
    // acquireTimeout: 60000, // 60秒獲取連接超時
    idleTimeout: 300000, // 5分鐘空閒超時
    maxIdle: 10, // 最大空閒連接
    enableKeepAlive: true, // 保持連接活躍
    keepAliveInitialDelay: 0, // 立即開始保持連接
    // 連接參數
    connectTimeout: 30000, // 30秒連接超時
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

// 錯誤處理 - 需要監聽底層連接池的錯誤
const poolConnection = dbPool.pool;
poolConnection.on("error", (err: any) => {
  console.error("Database pool error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("Database connection lost, attempting to reconnect...");
  }
});

// 優雅關閉連接池
process.on("SIGINT", async () => {
  console.log("Closing database pool...");
  await dbPool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Closing database pool...");
  await dbPool.end();
  process.exit(0);
});

export default dbPool;
