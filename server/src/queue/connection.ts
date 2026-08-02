// server/src/queue/connection.ts
// BullMQ 底層使用 ioredis，統一在這裡解析 REDIS_URL

const redisUrl = new URL(process.env.REDIS_URL!);

export const bullmqConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
};
