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
    keepAliveInitialDelay: 300000, // Send keep-alive packet every 5 minutes
    connectTimeout: 30000, // 30 秒連接超時
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error(`Redis connection failed after ${retries} retries`);
        return new Error("Redis connection failed");
      }
      const delay = Math.min(retries * 1000, 10000);
      console.log(`Redis reconnect attempt ${retries} in ${delay}ms`);
      return delay;
    },
  },
  // 添加命令超時配置到根級別
  commandsQueueMaxLength: 100,
  pingInterval: 30000,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error", err.message);
  isConnecting = false;
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

redisClient.on("end", () => {
  console.log("Redis connection ended.");
  isConnecting = false;
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
