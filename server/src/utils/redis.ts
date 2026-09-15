// server/src/utils/redis.ts

import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

let connectionPromise: Promise<void> | null = null;

const CACHE_REDIS_URL = process.env.REDIS_CACHE_URL!;

const VECTOR_REDIS_URL = process.env.REDIS_VECTOR_URL!;

function createManagedRedisClient(name: string, url: string) {
  const client = createClient({
    url,
    socket: {
      keepAlive: true,
      noDelay: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 30000,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error(
            `❌ [${name}] Redis connection failed after ${retries} retries`,
          );
          return new Error(`[${name}] Redis connection failed`);
        }
        const delay = Math.min(retries * 1000, 10000);
        console.log(
          `🔄 [${name}] Redis reconnect attempt ${retries} in ${delay}ms`,
        );
        return delay;
      },
    },
    commandsQueueMaxLength: 100,
    pingInterval: 30000,
  });

  client.on("error", (err) => {
    console.error(`❌ [${name}] Redis Client Error:`, err.message);
  });

  client.on("connect", () => {
    console.log(`✅ [${name}] Redis client connected successfully.`);
  });

  client.on("ready", () => {
    console.log(`✅ [${name}] Redis client ready.`);
  });

  client.on("disconnect", () => {
    console.log(`⚠️ [${name}] Redis client disconnected.`);
    connectionPromise = null;
  });

  client.on("reconnecting", () => {
    console.log(`🔄 [${name}] Redis client reconnecting...`);
  });

  client.on("end", () => {
    console.log(`[${name}] Redis connection ended.`);
    connectionPromise = null;
  });

  return client;
}

export type AppRedisClient = ReturnType<typeof createManagedRedisClient>;

export const cacheRedisClient = createManagedRedisClient(
  "cache",
  CACHE_REDIS_URL,
);
export const vectorRedisClient = createManagedRedisClient(
  "vector",
  VECTOR_REDIS_URL,
);

export async function connectRedis(): Promise<void> {
  if (connectionPromise) {
    return connectionPromise;
  }

  const needConnect = (client: AppRedisClient) =>
    !client.isOpen || !client.isReady;

  if (!needConnect(cacheRedisClient) && !needConnect(vectorRedisClient)) {
    return Promise.resolve();
  }

  connectionPromise = (async () => {
    try {
      console.log("🔌 Connecting to Redis instances (cache & vector)...");
      const connects: Promise<unknown>[] = [];
      if (needConnect(cacheRedisClient)) {
        connects.push(cacheRedisClient.connect());
      }
      if (needConnect(vectorRedisClient)) {
        connects.push(vectorRedisClient.connect());
      }
      await Promise.all(connects);
      console.log("✅ All Redis clients connected and ready");
    } catch (error) {
      connectionPromise = null;
      console.error("❌ Failed to connect to Redis:", error);
      throw error;
    }
  })();

  return connectionPromise;
}

async function disconnectSingleClient(
  client: AppRedisClient,
  name: string,
): Promise<void> {
  if (!client.isOpen) {
    console.log(`ℹ️ [${name}] Redis was already closed, skipping quit`);
    return;
  }

  try {
    console.log(`📍 [${name}] Calling client.quit() for graceful shutdown...`);
    const quitPromise = client.quit();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Quit timeout after 5s for ${name}`)),
        5000,
      ),
    );

    await Promise.race([quitPromise, timeoutPromise]);
    console.log(`✅ [${name}] Redis client disconnected successfully`);
  } catch (error) {
    console.warn(
      `⚠️ [${name}] Quit failed or timed out, forcing destroy:`,
      error,
    );
    try {
      client.destroy();
      console.log(`✅ [${name}] Redis force destroyed successfully`);
    } catch (destroyError) {
      console.error(`❌ [${name}] Force destroy also failed:`, destroyError);
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  connectionPromise = null;
  console.log("📍 Disconnecting all Redis clients...");
  await Promise.allSettled([
    disconnectSingleClient(cacheRedisClient, "cache"),
    disconnectSingleClient(vectorRedisClient, "vector"),
  ]);
  console.log("✅ Disconnect sequence completed");
}

export function getCacheRedisClient() {
  if (!cacheRedisClient.isOpen || !cacheRedisClient.isReady) {
    console.warn(
      "⚠️  Cache Redis client is not ready. Call connectRedis() first.",
    );
  }
  return cacheRedisClient;
}

export function getVectorRedisClient() {
  if (!vectorRedisClient.isOpen || !vectorRedisClient.isReady) {
    console.warn(
      "⚠️  Vector Redis client is not ready. Call connectRedis() first.",
    );
  }
  return vectorRedisClient;
}

// Backward compatibility alias (points to cache)
export function getRedisClient() {
  return getCacheRedisClient();
}

export function isRedisConnected(): boolean {
  return cacheRedisClient.isOpen && cacheRedisClient.isReady;
}

export async function checkRedisHealth(): Promise<{
  cache: boolean;
  vector: boolean;
}> {
  let cacheOk = false;
  let vectorOk = false;
  try {
    if (cacheRedisClient.isOpen && cacheRedisClient.isReady) {
      await cacheRedisClient.ping();
      cacheOk = true;
    }
  } catch (err) {
    console.error("❌ Cache Redis health check failed:", err);
  }

  try {
    if (vectorRedisClient.isOpen && vectorRedisClient.isReady) {
      await vectorRedisClient.ping();
      vectorOk = true;
    }
  } catch (err) {
    console.error("❌ Vector Redis health check failed:", err);
  }

  return { cache: cacheOk, vector: vectorOk };
}

export default cacheRedisClient;
