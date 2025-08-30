import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

let isConnecting = false;
//* Create a static Redis client instance
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    keepAlive: true,
    noDelay: true,
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        console.error("Redis connection failed after 20 retries");
        return new Error("Redis connection failed");
      }
      return Math.min(retries * 200, 5000); // 重連間隔，最長 5 秒
    },
    connectTimeout: 30000, // 30 秒連接超時
  },
  // 添加命令超時配置到根級別
  commandsQueueMaxLength: 100,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error", err.message);
});

redisClient.on("connect", () => {
  console.log("Redis client connected successfully.");
  isConnecting = false;
});

redisClient.on("disconnect", () => {
  console.log("Redis client disconnected.");
  isConnecting = false;
});

redisClient.on("reconnecting", () => {
  console.log("Redis client reconnecting...");
  isConnecting = true;
});

export async function connectRedis() {
  try {
    if (redisClient.isOpen || redisClient.isReady || isConnecting) {
      return;
    }
    isConnecting = true;
    console.log("Connecting to Redis...");
    await redisClient.connect();
  } catch (error) {
    isConnecting = false;
    console.error("Failed to connect to Redis:", error);
    throw new Error("Redis connection failed");
  }
}

export async function disconnectRedis() {
  try {
    isConnecting = false;
    if (redisClient.isOpen || redisClient.isReady) {
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
  return redisClient.isOpen && redisClient.isReady;
}
