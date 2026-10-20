// server/src/utils/acquireConnection.ts

import type { PoolConnection } from "mysql2/promise";
import dbPool from "./db";

const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;

export class ConnectionAcquireTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for a DB connection`);
    this.name = "ConnectionAcquireTimeoutError";
  }
}

/**
 * dbPool.getConnection() with a deadline. mysql2 queues waiters forever
 * (queueLimit: 0, no acquire timeout), so an exhausted pool would otherwise
 * hang the request silently. The waiter cannot be removed from mysql2's
 * queue, so a connection that arrives after the deadline is released at once.
 */
export async function acquireConnection(
  timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
): Promise<PoolConnection> {
  const pending = dbPool.getConnection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConnectionAcquireTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([pending, deadline]);
  } catch (err) {
    if (err instanceof ConnectionAcquireTimeoutError) {
      pending.then(
        (connection) => connection.release(),
        () => {},
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
