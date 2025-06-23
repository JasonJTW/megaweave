import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

//* Create a static Redis client instance
const redisClient = createClient({
  url: process.env.REDIS_URL,
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
