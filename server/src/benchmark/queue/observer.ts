// server/src/benchmark/queue/observer.ts
// 從 queue 外部觀察 BullMQ：訂閱公開的事件串流 (QueueEvents) 取得每個 job 的生命週期，
// 並定期取樣各 queue 的深度與 queue Redis 記憶體。不讀取 worker 內部狀態。

import { Queue, QueueEvents } from "bullmq";
import type Redis from "ioredis";
import type { JobEvent, JobEventType } from "./accounting";
import type { DepthSample } from "./backlog";

export interface QueueObserver {
  events: JobEvent[];
  depthSamples: DepthSample[];
  queueRedisPeakMemoryBytes(): number | null;
  stop(): Promise<void>;
}

const OBSERVED_EVENTS: readonly JobEventType[] = ["added", "active", "completed", "failed", "stalled"];

/** 事件串流 ID 為 "<毫秒時間戳>-<序號>"，時間戳來自 Redis 伺服器時鐘 */
const streamTimeMs = (id: string) => Number(id.split("-")[0]);

async function redisTimeMs(queueRedis: Redis): Promise<number> {
  const [seconds, micros] = await queueRedis.time();
  return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
}

function parseUsedMemory(info: string): number | null {
  const match = /^used_memory:(\d+)$/m.exec(info);
  return match ? Number(match[1]) : null;
}

/** queueRedis：與 queues 相同的 queue Redis 連線，用於讀取伺服器時間與記憶體 */
export async function startQueueObserver(
  queues: readonly Queue[],
  queueRedis: Redis,
  sampleIntervalMs: number,
): Promise<QueueObserver> {
  const events: JobEvent[] = [];
  const depthSamples: DepthSample[] = [];
  let peakMemory: number | null = null;

  // 從目前的 Redis 時間開始讀取，而非預設的 "$"，避免開始監聽前的空窗遺漏事件
  const startId = `${await redisTimeMs(queueRedis)}-0`;
  const listeners = queues.map((queue) => {
    const queueEvents = new QueueEvents(queue.name, {
      connection: queue.opts.connection,
      prefix: queue.opts.prefix,
      lastEventId: startId,
    });
    for (const type of OBSERVED_EVENTS) {
      queueEvents.on(type, ({ jobId }: { jobId: string }, id: string) => {
        events.push({ queue: queue.name, jobId, type, atMs: streamTimeMs(id) });
      });
    }
    return queueEvents;
  });
  await Promise.all(listeners.map((listener) => listener.waitUntilReady()));

  const sample = async () => {
    const atMs = Date.now();
    const counts = await Promise.all(
      queues.map((queue) => queue.getJobCounts("waiting", "delayed", "prioritized", "active")),
    );
    depthSamples.push({
      atMs,
      byQueue: Object.fromEntries(
        queues.map((queue, index) => [
          queue.name,
          {
            waiting: counts[index].waiting ?? 0,
            delayed: counts[index].delayed ?? 0,
            prioritized: counts[index].prioritized ?? 0,
            active: counts[index].active ?? 0,
          },
        ]),
      ),
    });
    const memory = parseUsedMemory(await queueRedis.info("memory"));
    if (memory !== null) peakMemory = Math.max(peakMemory ?? 0, memory);
  };

  let sampling: Promise<void> | null = null;
  const tick = () => {
    // 前一次取樣尚未完成時跳過，避免 Redis 忙碌時堆積請求
    if (sampling) return;
    sampling = sample()
      .catch(() => {})
      .finally(() => {
        sampling = null;
      });
  };
  tick();
  const timer = setInterval(tick, sampleIntervalMs);

  return {
    events,
    depthSamples,
    queueRedisPeakMemoryBytes: () => peakMemory,
    async stop() {
      clearInterval(timer);
      await sampling;
      await Promise.all(listeners.map((listener) => listener.close()));
    },
  };
}

/** 在觀察器仍在收事件時等待條件成立；逾時回傳 false 而不丟出錯誤，由呼叫端決定如何回報 */
export async function waitFor(condition: () => boolean, timeoutMs: number, pollMs = 250): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return true;
}
