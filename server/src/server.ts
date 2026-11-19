// server/src/server.ts

import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import https from "https";
import http from "http";
import path from "path";
import fs from "fs";

// express-rate-limit v7 adds a 'close' listener to every ServerResponse to
// detect aborted requests. With concurrent traffic the default limit of 10
// listeners is quickly exceeded. Raise it here before any middleware is wired.
http.ServerResponse.prototype.setMaxListeners(50);
import { connectRedis, disconnectRedis, getCacheRedisClient } from "./utils/redis";
import { closeDatabase } from "./utils/db";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { startWorkers, stopWorkers } from "./queue/workers";
import { initHotScoreCron } from "./queue/queues";
import { ensureVectorIndexExists } from "./services/vectorIndexService";
import { setSocketIO } from "./utils/socket";
import { createShutdown } from "./utils/gracefulShutdown";
import { registerSocketHandlers } from "./socketHandlers";

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["https://localhost:3000"];
const PORT = parseInt(process.env.PORT || "8443");
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";

console.log("Cors Origins:", CORS_ORIGINS);
const app = createApp({ corsOrigins: CORS_ORIGINS, enableHttps: ENABLE_HTTPS });

async function startServer() {
  try {
    await connectRedis();
    await ensureVectorIndexExists();

    if (process.env.RUN_WORKERS_INLINE === "true") {
      console.log(
        "⚠️  RUN_WORKERS_INLINE=true: starting BullMQ workers inline with server process",
      );
      await startWorkers();
      await initHotScoreCron();
    }

    const redisClient = getCacheRedisClient();

    //* 1.Get Redis clients for Socket.IO adapter
    const pubClient = redisClient;
    const subClient = redisClient.duplicate();
    await subClient.connect();
    console.log("✅ Redis subscriber client connected for Socket.IO adapter");

    let server: https.Server | http.Server;

    if (ENABLE_HTTPS) {
      // HTTPS 服務器啟動邏輯...
      const CERT_PATH = process.env.CERT_PATH;
      const KEY_PATH = process.env.KEY_PATH;
      const PASSPHRASE = process.env.PASSPHRASE;

      if (!CERT_PATH || !KEY_PATH) {
        console.error(
          "HTTPS configuration is incomplete: CERT_PATH and KEY_PATH are required. " +
            "Please check your .env.development file.",
        );
        process.exit(1);
      }
      //* Implement https in local dev env
      //* PASSPHRASE 為選用：mkcert 產出的私鑰未加密，沒有密碼可填。
      server = https.createServer(
        {
          key: fs.readFileSync(path.join(__dirname, KEY_PATH)),
          cert: fs.readFileSync(path.join(__dirname, CERT_PATH)),
          ...(PASSPHRASE ? { passphrase: PASSPHRASE } : {}),
        },
        app,
      );
    } else {
      server = http.createServer(app);
    }
    //* 2.Socket.IO setup
    const io = new SocketIOServer(server, {
      cors: {
        origin: CORS_ORIGINS,
        credentials: true,
      },
    });

    //* 3.Attach Redis adapter to Socket.IO
    io.adapter(createAdapter(pubClient, subClient));

    //* 4.Socket.IO 驗證與 connection handling（handshake 讀 session，只能加入有權限的 room）
    registerSocketHandlers(io);
    //* 5.將 io 實例存入 app，讓以後的 API Route 可以透過 req.app.get("io") 取得
    //* app.ts 的 middleware 再把它放進 res.locals.io
    app.set("io", io);
    setSocketIO(io);

    //* start server
    server.listen(PORT, () => {
      console.log(
        `${ENABLE_HTTPS ? "Secure " : ""}Server listening on port ${PORT}`,
      );
    });

    //* 關機順序與逾時見 utils/gracefulShutdown.ts；這裡只提供要收尾的連線
    const shutdown = createShutdown({
      server,
      io,
      cleanup: async () => {
        console.log("\n=== Starting graceful shutdown sequence ===");

        //* Step 0: Disconnect subClient for Socket.IO adapter
        console.log("\n📍 Step 0/2: Disconnecting Socket.IO Redis subscriber...");
        await subClient.quit();

        if (process.env.RUN_WORKERS_INLINE === "true") {
          console.log("\n📍 Stopping inline BullMQ workers...");
          await stopWorkers();
        }

        // Step 1: 關閉 Redis
        console.log("\n📍 Step 1/2: Closing Redis...");
        await disconnectRedis();

        // Step 2: 關閉資料庫
        console.log("\n📍 Step 2/2: Closing database...");
        await closeDatabase();
      },
    });

    // ✅ 只在這裡監聽信號
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
