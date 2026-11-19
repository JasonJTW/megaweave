// server/src/app.ts
// Builds the Express app: middleware, top-level routes, `/api` and the error
// middleware. No listener, Socket.IO or Redis connection happens here, so tests
// can build the same app that server.ts serves (see openapiContract.test.ts).

import express, { Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import apiRoutes from "./api";
import { errorMiddleware } from "./utils/errorHandler";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { getBenchmarkHealthFields, isBenchmarkTarget } from "./benchmark/targetMarker";
import {
  getCandidateVectorReadStats,
  getFeedVectorCacheSizes,
  resetFeedVectorCaches,
} from "./services/feedService";

export interface CreateAppOptions {
  corsOrigins: string[];
  enableHttps: boolean;
}

export function createApp({ corsOrigins, enableHttps }: CreateAppOptions): Express {
  const app = express();
  app.set("trust proxy", 1);
  // Lalamove webhook 需以原始 body 驗簽，必須在 express.json() 之前解析為 Buffer
  app.use("/api/lalamove/webhook", express.raw({ type: "*/*", limit: "1mb" }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // Apply the distributed rate limiting middleware to all requests.
  app.use(globalRateLimiter);

  app.get("/health", (_req, res) => {
    res.json({
      status: "OK",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      ssl: enableHttps,
      ...getBenchmarkHealthFields(process.env, () => {
        const cpu = process.cpuUsage();
        const memory = process.memoryUsage();
        return {
          feedCandidateVectorReads: getCandidateVectorReadStats(),
          feedVectorCaches: getFeedVectorCacheSizes(),
          process: {
            cpuUserMicros: cpu.user,
            cpuSystemMicros: cpu.system,
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
          },
        };
      }),
    });
  });

  // Benchmark 專用：清空 API 記憶體向量快取以建立 cold-cache 情境；只在帶隔離標記的 instance 掛載
  if (isBenchmarkTarget()) {
    app.post("/benchmark/feed-caches/reset", (_req, res) => {
      resetFeedVectorCaches();
      res.json({ feedVectorCaches: getFeedVectorCacheSizes() });
    });
  }

  //* server.ts 啟動時以 app.set("io", io) 存入 Socket.IO；路由從 res.locals.io 取用
  app.use((req, res, next) => {
    res.locals.io = req.app.get("io");
    next();
  });

  app.use("/api", apiRoutes);

  //* 必須掛在所有路由之後
  app.use(errorMiddleware);

  return app;
}
