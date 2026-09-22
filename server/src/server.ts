// server/src/server.ts

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cookieParser from "cookie-parser";
import apiRoutes from "./api";
import cors from "cors";
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
import { globalRateLimiter } from "./middleware/rateLimiter";
import { getBenchmarkHealthFields } from "./benchmark/targetMarker";
import { getCandidateVectorReadStats } from "./services/feedService";

const app = express();
app.set("trust proxy", 1);
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["https://localhost:3000"];
const PORT = parseInt(process.env.PORT || "8443");
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

console.log("Cors Origins:", CORS_ORIGINS);
// Apply the distributed rate limiting middleware to all requests.
app.use(globalRateLimiter);

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    ssl: ENABLE_HTTPS,
    ...getBenchmarkHealthFields(process.env, () => ({
      feedCandidateVectorReads: getCandidateVectorReadStats(),
    })),
  });
});

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

      if (!CERT_PATH || !KEY_PATH || !PASSPHRASE) {
        console.error(
          "HTTPS configuration is incomplete. Please check your .env.development file.",
        );
        process.exit(1);
      }
      //* Implement https in local dev env
      server = https.createServer(
        {
          key: fs.readFileSync(path.join(__dirname, KEY_PATH)),
          cert: fs.readFileSync(path.join(__dirname, CERT_PATH)),
          passphrase: PASSPHRASE, // 替換為你的密碼
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

    //* 4.Socket.IO connection handling
    io.on("connection", (socket) => {
      // console.log(`🔌 New client connected: ${socket.id}`);

      //* 讓客戶端告知 User ID 並加入 Room
      socket.on("join_room", (userId: string) => {
        const roomName = `user_${userId}`;
        socket.join(roomName);
        // console.log(`👤User ${userId} joined room: ${roomName}`);
      });
      //* 加入特定訂單的配送即時追蹤 Room
      socket.on("join_delivery", (orderId: string) => {
        const roomName = `delivery_${orderId}`;
        socket.join(roomName);
        console.log(`📦 Socket ${socket.id} joined delivery room: ${roomName}`);
      });
      socket.on("leave_delivery", (orderId: string) => {
        const roomName = `delivery_${orderId}`;
        socket.leave(roomName);
        console.log(`📦 Socket ${socket.id} left delivery room: ${roomName}`);
      });
      socket.on("disconnect", () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
      });
    });
    //* 5.將 io 實例存入 app，讓以後的 API Route 可以透過 req.app.get("io") 取得
    app.set("io", io);
    setSocketIO(io);

    //* 6. Add middleware to inject io into res.locals for all routes
    app.use((_req, res, next) => {
      res.locals.io = io;
      next();
    });

    app.use("/api", apiRoutes);

    //* start server
    server.listen(PORT, () => {
      console.log(
        `${ENABLE_HTTPS ? "Secure " : ""}Server listening on port ${PORT}`,
      );
    });

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      //* Close Socket.IO server
      io.close();

      // 1. 停止接受新請求
      server.close(async () => {
        console.log("✅ server closed");

        // 2. 按順序關閉連接
        try {
          console.log("\n=== Starting graceful shutdown sequence ===");

          //* Step 0: Disconnect subClient for Socket.IO adapter
          console.log(
            "\n📍 Step 0/2: Disconnecting Socket.IO Redis subscriber...",
          );
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

          console.log("\n✅ All connections closed successfully");
          console.log("=== Server Shutdown complete ===\n");
          process.exit(0);
        } catch (error) {
          console.error("\n❌ Error during server shutdown:", error);
          process.exit(1);
        }
      });

      // 如果 30 秒內還沒關閉，強制退出
      setTimeout(() => {
        console.error("\n⚠️  Forced shutdown after 30s timeout");
        process.exit(1);
      }, 30000);
    };

    // ✅ 只在這裡監聽信號
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
