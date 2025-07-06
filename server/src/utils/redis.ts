import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

//* Create a static Redis client instance
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    keepAlive: true,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis connection failed after 10 retries");
        return new Error("Redis connection failed");
      }
      return Math.min(retries * 100, 3000); // 重連間隔，最長 3 秒
    },
    connectTimeout: 10000, // 10 秒連接超時
  },
  // 添加命令超時配置到根級別
  commandsQueueMaxLength: 100,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error", err);
});

redisClient.on("connect", () => {
  console.log("Redis client connected successfully.");
});

redisClient.on("disconnect", () => {
  console.log("Redis client disconnected.");
});

export async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      console.log("Connecting to Redis...");
      await redisClient.connect();
    }
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    throw new Error("Redis connection failed");
  }
}

export async function disconnectRedis() {
  try {
    if (redisClient.isOpen) {
      console.log("Disconnecting from Redis...");
      await redisClient.quit();
      console.log("Redis client disconnected successfully.");
    }
  } catch (error) {
    console.error("Error disconnecting Redis client:", error);
  }
}

export function getRedisClient() {
  return redisClient;
}

export function isRedisConnected() {
  return redisClient.isOpen;
}
