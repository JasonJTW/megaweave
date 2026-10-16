// server/src/utils/redis.ts

import { createClient } from "@redis/client";
import dotenv from "dotenv";
dotenv.config();

let connectionPromise: Promise<void> | null = null;

const CACHE_REDIS_URL = process.env.REDIS_CACHE_URL!;

const VECTOR_REDIS_URL = process.env.REDIS_VECTOR_URL!;

const MAX_RECONNECT_RETRIES = 10;
// How long to wait after node-redis gives up before starting a fresh connect().
const RECOVERY_DELAY_MS = 30000;

// Set by disconnectRedis() so a graceful shutdown doesn't trigger recovery.
let shuttingDown = false;

interface RecoverableClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
}

/**
 * Once reconnectStrategy returns an Error, node-redis closes the client for
 * good (isOpen=false, no "end" event) and never retries again. This schedules
 * a fresh connect() after a delay; if that attempt also exhausts its retries,
 * reconnectStrategy gives up again and schedules the next one.
 */
export function createRecoveryScheduler(
  name: string,
  client: RecoverableClient,
  delayMs: number = RECOVERY_DELAY_MS,
  isShuttingDown: () => boolean = () => shuttingDown,
) {
  let timer: NodeJS.Timeout | null = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    if (timer || isShuttingDown()) {
      return;
    }
    console.warn(`⏳ [${name}] Redis recovery scheduled in ${delayMs}ms`);
    timer = setTimeout(async () => {
      timer = null;
      if (isShuttingDown() || client.isOpen) {
        return;
      }
      try {
        console.log(`🔄 [${name}] Redis recovery: reconnecting...`);
        await client.connect();
      } catch (err) {
        // reconnectStrategy already scheduled the next attempt on give-up.
        console.error(
          `❌ [${name}] Redis recovery attempt failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }, delayMs);
    // Don't keep the process alive just to reconnect.
    timer.unref();
  };

  return { schedule, cancel };
}

const recoverySchedulers: ReturnType<typeof createRecoveryScheduler>[] = [];

function createManagedRedisClient(name: string, url: string) {
  // Assigned right after createClient(); reconnectStrategy only runs later.
  let recovery: ReturnType<typeof createRecoveryScheduler> | null = null;

  const client = createClient({
    url,
    socket: {
      keepAlive: true,
      noDelay: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 30000,
      reconnectStrategy: (retries) => {
        if (retries > MAX_RECONNECT_RETRIES) {
          console.error(
            `❌ [${name}] Redis connection failed after ${retries} retries`,
          );
          // The client is about to close permanently; let connectRedis()
          // start over and schedule a fresh connection attempt.
          connectionPromise = null;
          recovery?.schedule();
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

  recovery = createRecoveryScheduler(name, client);
  recoverySchedulers.push(recovery);

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
  shuttingDown = false;
  if (connectionPromise) {
    return connectionPromise;
  }

  // Only closed clients need connect(). An open but not-ready client is already
  // reconnecting on its own; calling connect() on it throws "Socket already
  // opened". Callers that need a ready client check isRedisConnected() after.
  const needConnect = (client: AppRedisClient) => !client.isOpen;

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
  shuttingDown = true;
  recoverySchedulers.forEach((recovery) => recovery.cancel());
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
