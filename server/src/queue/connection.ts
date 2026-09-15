// server/src/queue/connection.ts
// BullMQ 底層使用 ioredis，統一在此解析 REDIS_QUEUE_URL（Fallback 到 REDIS_URL）
import dotenv from "dotenv";
dotenv.config();

function getBullmqConnection() {
  try {
    const rawUrl = process.env.REDIS_QUEUE_URL!;
    const redisUrl = new URL(rawUrl);
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port),
      password: redisUrl.password || undefined,
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: 6380,
    };
  }
}

export const bullmqConnection = getBullmqConnection();
