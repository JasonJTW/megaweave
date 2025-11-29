// server/src/server.ts

import express from "express";
import cookieParser from "cookie-parser";
const app = express();
import apiRoutes from "./api";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { connectRedis, disconnectRedis } from "./utils/redis";
import { closeDatabase } from "./utils/db";

dotenv.config();

const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["https://localhost:3000"];
const PORT = parseInt(process.env.PORT || "8443");
const HOSTNAME = process.env.HOSTNAME || "localhost";
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === "true";
const NODE_ENV = process.env.NODE_ENV;
const limiter = rateLimit({
  windowMs: 1 * 10 * 1000, // 10 seconds
  limit: 20,
  // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  message: {
    errorMessage: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
console.log("Cors Origins:", CORS_ORIGINS);
// Apply the rate limiting middleware to all requests.
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CORS_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

if (NODE_ENV !== "development") {
  app.use(limiter);
}

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    ssl: ENABLE_HTTPS,
  });
});

app.use("/api", apiRoutes);

async function startServer() {
  try {
    await connectRedis(); // 先連接 Redis
    let server: https.Server | ReturnType<typeof app.listen>;
    if (ENABLE_HTTPS) {
      // HTTPS 服務器啟動邏輯...
      const CERT_PATH = process.env.CERT_PATH;
      const KEY_PATH = process.env.KEY_PATH;
      const PASSPHRASE = process.env.PASSPHRASE;

      if (!CERT_PATH || !KEY_PATH || !PASSPHRASE) {
        console.error(
          "HTTPS configuration is incomplete. Please check your .env.development file."
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
        app
      );

      server.listen(PORT, () => {
        console.log(`Secure server listening on port ${PORT}`);
      });
    } else {
      server = app.listen(PORT, () => {
        console.log(`Server listening on Port ${PORT}`);
      });
    }

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      // 1. 停止接受新請求
      server.close(async () => {
        console.log("✅ server closed");

        // 2. 按順序關閉連接
        try {
          console.log("\n=== Starting graceful shutdown sequence ===");

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
