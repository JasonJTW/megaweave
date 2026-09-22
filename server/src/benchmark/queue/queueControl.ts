// server/src/benchmark/queue/queueControl.ts
// 執行前的 queue 狀態控制：確認有 worker 在處理，並清掉先前中斷執行殘留的工作。

import type { Queue } from "bullmq";

const QUEUE_IDLE_TIMEOUT_MS = 60_000;

export async function requireWorkers(queues: readonly Queue[]): Promise<Record<string, number>> {
  const counts = Object.fromEntries(
    await Promise.all(queues.map(async (queue) => [queue.name, await queue.getWorkersCount()] as const)),
  );
  const missing = Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `No worker is consuming ${missing.join(", ")}; start one with npm run benchmark:worker before running this profile`,
    );
  }
  return counts;
}

/** 清掉先前中斷執行殘留、尚未處理的工作，讓深度與帳目只反映本次執行；回傳清掉的數量 */
export async function drainQueues(queues: readonly Queue[]): Promise<Record<string, number>> {
  const leftover: Record<string, number> = {};
  for (const queue of queues) {
    const counts = await queue.getJobCounts("waiting", "delayed", "prioritized");
    leftover[queue.name] = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    await queue.drain(true);
  }
  return leftover;
}

/** 等待仍在處理中的殘留 job 結束 */
export async function waitForIdleQueues(queues: readonly Queue[]): Promise<void> {
  const deadline = Date.now() + QUEUE_IDLE_TIMEOUT_MS;
  for (;;) {
    const counts = await Promise.all(queues.map((queue) => queue.getJobCounts("active")));
    if (counts.every((count) => (count.active ?? 0) === 0)) return;
    if (Date.now() >= deadline) {
      throw new Error(`Queues still have active jobs from a previous run after ${QUEUE_IDLE_TIMEOUT_MS / 1000}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
