// server/src/queue/connection.ts
// BullMQ 底層使用 ioredis，統一在這裡解析 REDIS_URL
import dotenv from "dotenv";
dotenv.config();

function getBullmqConnection() {
  try {
    const rawUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    const redisUrl = new URL(rawUrl);
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: 6379,
    };
  }
}

export const bullmqConnection = getBullmqConnection();
