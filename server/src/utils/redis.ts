// server/src/utils/redis.ts

import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

let isConnecting = false;
//! New insert
let connectionPromise: Promise<void> | null = null;

//* Create a static Redis client instance
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    keepAlive: true,
    noDelay: true,
    keepAliveInitialDelay: 10000, // Send keep-alive packet every 10 seconds
    connectTimeout: 30000, // 30 秒連接超時
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error(`❌ Redis connection failed after ${retries} retries`);
        return new Error("Redis connection failed");
      }
      const delay = Math.min(retries * 1000, 10000);
      console.log(`🔄 Redis reconnect attempt ${retries} in ${delay}ms`);
      return delay;
    },
  },
  // 添加命令超時配置到根級別
  commandsQueueMaxLength: 100,
  pingInterval: 30000,
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error", err.message);
  console.log("Redis URL: ", process.env.REDIS_URL);
  isConnecting = false;

  //! New insert
  connectionPromise = null;
});

redisClient.on("connect", () => {
  console.log("✅ Redis client connected successfully.");
  isConnecting = false;
});

redisClient.on("ready", () => {
  console.log("✅ Redis client ready.");
  isConnecting = false;
});

redisClient.on("disconnect", () => {
  console.log("⚠️ Redis client disconnected.");
  isConnecting = false;
  connectionPromise = null;
});

redisClient.on("reconnecting", () => {
  console.log("🔄 Redis client reconnecting...");
  isConnecting = true;
});

redisClient.on("end", () => {
  console.log("Redis connection ended.");
  isConnecting = false;
  connectionPromise = null;
});

export async function connectRedis(): Promise<void> {
  // ✅ 如果已經在連接中，返回同一個 Promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // ✅ 如果已經連接，直接返回
  if (redisClient.isOpen && redisClient.isReady) {
    return Promise.resolve();
  }

  // ✅ 創建新的連接 Promise
  connectionPromise = (async () => {
    try {
      isConnecting = true;
      console.log("🔌 Connecting to Redis...");
      await redisClient.connect();
      console.log("✅ Redis connected and ready");
    } catch (error) {
      isConnecting = false;
      connectionPromise = null;
      console.error("❌ Failed to connect to Redis:", error);
      throw error;
    }
  })();

  return connectionPromise;
}

//* Disconnect from Redis
export async function disconnectRedis(): Promise<void> {
  try {
    console.log("📍 [1/5] disconnectRedis called");

    isConnecting = false;
    connectionPromise = null;

    console.log("📍 [2/5] Checking Redis status:");
    console.log("  - isOpen:", redisClient.isOpen);
    console.log("  - isReady:", redisClient.isReady);

    if (redisClient.isOpen) {
      console.log(
        "📍 [3/5] Calling redisClient.quit() for graceful shutdown..."
      );

      // ✅ Add timeout protection
      const quitPromise = redisClient.quit();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Quit timeout after 5s")), 5000)
      );

      try {
        await Promise.race([quitPromise, timeoutPromise]);
        console.log("📍 [4/5] Quit completed");
        console.log("✅ [5/5] Redis client disconnected successfully");
      } catch (timeoutError) {
        console.warn("⚠️  Quit timeout, forcing destroy");
        throw timeoutError;
      }
    } else {
      console.log("ℹ️  [3/5] Redis was already closed, skipping quit");
    }
  } catch (error) {
    console.error("❌ Error during graceful Redis disconnect:", error);

    // ✅ Force shutdown with destroy() (not disconnect())
    try {
      console.log("📍 Attempting force shutdown with destroy()...");
      redisClient.destroy();
      console.log("✅ Redis force destroyed successfully");
    } catch (destroyError) {
      console.error("❌ Force destroy also failed:", destroyError);
      console.log("⚠️  Giving up on Redis cleanup, proceeding with shutdown");
    }
  }
}

//* Get Redis client instance
export function getRedisClient() {
  if (!redisClient.isOpen || !redisClient.isReady) {
    console.warn("⚠️  Redis client is not ready. Call connectRedis() first.");
  }
  return redisClient;
}

//* Check if Redis is connected
export function isRedisConnected(): boolean {
  return redisClient.isOpen && redisClient.isReady;
}

// ✅ 新增：健康檢查函數
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error("❌ Redis health check failed:", error);
    return false;
  }
}

export default redisClient;
