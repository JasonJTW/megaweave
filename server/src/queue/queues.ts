// server/src/queue/queues.ts
// 職責：建立所有 Queue 實例，提供 enqueue helpers 給 route handlers 使用
//* producer

import { Job, Queue } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";
import { PostEmbeddingJobData } from "./jobs/postEmbedding";
import { UserVectorJobData } from "./jobs/userVector";
import type { DeliveryRefundJobData } from "./jobs/deliveryRefund";

import type { SendEmailJobData } from "./jobs/email";
import { getCacheRedisClient } from "../utils/redis";

export const postImageQueue = new Queue<
  PostUploadImageJobData | PostDeleteImageJobData
>("post-image", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export async function enqueuePostUploadImages(
  data: PostUploadImageJobData,
): Promise<Job<PostUploadImageJobData>> {
  const job = await postImageQueue.add("upload-images", data, { delay: 100 });
  console.log(`🖼️ Enqueued upload images job for post #${data.postId}`);
  return job as Job<PostUploadImageJobData>;
}

export async function enqueuePostDeleteImages(
  data: PostDeleteImageJobData,
): Promise<void> {
  await postImageQueue.add("delete-images", data);
  console.log(`🗑️ Enqueued delete images job for ${data.s3Keys.length} files`);
}

export const emailQueue = new Queue<SendEmailJobData>("email", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60, // 7 days in seconds
      count: 1000, // keep at most 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // 7 days in seconds
    },
  },
});

export async function enqueueSendEmail(
  data: SendEmailJobData,
): Promise<void> {
  await emailQueue.add("send-email", data);
  console.log(`📧 Enqueued email job for ${data.toEmail}`);
}

//* ─── Embedding Queue ─────────────────────────────────────────────────────────

export const embeddingQueue = new Queue<PostEmbeddingJobData>(
  "post-embedding",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  },
);

export async function enqueuePostEmbedding(
  data: PostEmbeddingJobData,
): Promise<Job<PostEmbeddingJobData>> {
  const job = await embeddingQueue.add("generate-embedding", data, { delay: 500 });
  console.log(`🧠 Enqueued embedding job for post #${data.postId}`);
  return job;
}

//* ─── User Vector Queue ──────────────────────────────────────────────────────

export const userVectorQueue = new Queue<UserVectorJobData>(
  "user-vector",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { age: 3 * 24 * 60 * 60 },
    },
  },
);

const VIEW_VECTOR_COOLDOWN_SECONDS = 5 * 60;  // view：5 分鐘冷卻
const ACTION_VECTOR_COOLDOWN_SECONDS = 60;     // like / comment / weave：1 分鐘防抖

/** 回傳排入的 job；冷卻期內的重複事件不排入，回傳 null */
export async function enqueueUserVectorUpdate(
  data: UserVectorJobData,
): Promise<Job<UserVectorJobData> | null> {
  // 對所有 action 進行防抖去重，避免短時間內對同一 (user, post, action) 重複丟 job
  // view: 5 分鐘冷卻（行為輕量，高頻觸發）
  // like / comment / weave: 1 分鐘防抖（理論上不會秒速重複，保險起見）
  const cooldownSeconds =
    data.action === "view"
      ? VIEW_VECTOR_COOLDOWN_SECONDS
      : ACTION_VECTOR_COOLDOWN_SECONDS;

  try {
    const redis = getCacheRedisClient();
    const dedupKey = `user_vector_${data.action}_cd:${data.userId}:${data.postId}`;
    const acquired = await redis.set(dedupKey, "1", {
      NX: true,
      EX: cooldownSeconds,
    });

    if (!acquired) {
      // 還在冷卻期內，忽略重複事件
      return null;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to check user-vector ${data.action} cooldown:`, err);
    // Redis 失敗時仍繼續丟 job，避免向量更新完全停擺
  }

  const job = await userVectorQueue.add("update-user-vector", data);
  console.log(
    `👤 Enqueued user-vector job: user #${data.userId} ← post #${data.postId} (${data.action})`,
  );
  return job;
}

//* ─── User Vector Flush Queue (Write-Back cron) ─────────────────────────

export const userVectorFlushQueue = new Queue(
  "user-vector-flush",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  },
);

/**
 * 啟動 Write-Back flush 排程（每 10 分鐘批次把 Redis dirty set 寫回 MySQL）
 */
export async function initUserVectorFlushCron(): Promise<void> {
  await userVectorFlushQueue.upsertJobScheduler(
    "cron-flush-user-vectors",
    { pattern: "*/10 * * * *" },
    { name: "flush-user-vectors" },
  );

  // 啟動時立刻排入一次，避免第一次必须等到 10 分鐘
  await userVectorFlushQueue.add(
    "flush-user-vectors",
    {},
    { delay: 2000 },
  );
  console.log("⏱️ UserVectorFlush Cron Scheduler initialized (runs every 10 mins)");
}

//* ─── Hot Score Queue ────────────────────────────────────────────────────────

export const hotScoreQueue = new Queue("hot-score", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

/**
 * feed:trending 遺失時（例如 cache Redis 重啟、不持久化）提早觸發重算，
 * 不必等下一次 cron（最久 15 分鐘）。
 * 以 SET NX EX 搶冷卻鎖，避免每個熱門頁請求都排入一個 job。
 * 不用固定 jobId 去重：removeOnComplete 會保留已完成的 job，同 id 會擋掉下一次重建。
 */
const HOT_SCORE_REBUILD_LOCK_KEY = "hot-score:rebuild-lock";
const HOT_SCORE_REBUILD_LOCK_TTL_SEC = 60;

export async function requestHotScoreRebuild(): Promise<boolean> {
  const redis = getCacheRedisClient();
  const acquired = await redis.set(HOT_SCORE_REBUILD_LOCK_KEY, "1", {
    NX: true,
    EX: HOT_SCORE_REBUILD_LOCK_TTL_SEC,
  });
  if (acquired !== "OK") return false;

  await hotScoreQueue.add("calculate-hot-score", {});
  console.log("⏱️ HotScore: feed:trending missing, rebuild job enqueued");
  return true;
}

/**
 * 啟動 HotScore 定期排程工作（每 15 分鐘執行一次）
 *
 * 啟動時防抖：讀取 hot-score:last-run timestamp，
 * 若距上次執行 < 15 分鐘（= cron 週期），跳過立即排入，
 * 避免頻繁重啟重複觸發全站計算。
 */
export async function initHotScoreCron(): Promise<void> {
  // 1. 設定每 15 分鐘執行的 Repeatable Job (BullMQ v6 upsertJobScheduler)
  await hotScoreQueue.upsertJobScheduler(
    "cron-calculate-hot-score",
    {
      pattern: "*/15 * * * *",
    },
    {
      name: "calculate-hot-score",
    },
  );

  // 2. 啟動時防抖：距上次執行 < 15 分鐘（= cron 週期）則跳過
  //    語義：同一個 cron 週期內已跑過，本次啟動就不重複觸發
  const MIN_INTERVAL_MS = 15 * 60 * 1000;
  const LAST_RUN_KEY = "hot-score:last-run";

  try {
    const redis = getCacheRedisClient();
    const lastRunStr = await redis.get(LAST_RUN_KEY);
    const lastRunMs = lastRunStr ? Number(lastRunStr) : 0;
    const elapsedMs = Date.now() - lastRunMs;

    if (elapsedMs < MIN_INTERVAL_MS) {
      const remainSec = Math.ceil((MIN_INTERVAL_MS - elapsedMs) / 1000);
      console.log(
        `⏱️ HotScore Cron: skipping startup job (last run ${Math.floor(elapsedMs / 1000)}s ago, next in ~${remainSec}s)`,
      );
    } else {
      // 距上次超過 10 分鐘（或首次啟動）才立即排入
      await hotScoreQueue.add("calculate-hot-score", {}, { delay: 1000 });
      console.log("⏱️ HotScore Cron: startup job enqueued");
    }
  } catch (err) {
    // Redis 失敗時保守地排入，避免 trending 長時間空白
    console.warn("⚠️ HotScore Cron: failed to read last-run key, enqueuing anyway:", err);
    await hotScoreQueue.add("calculate-hot-score", {}, { delay: 1000 });
  }

  console.log("⏱️ HotScore Cron Scheduler initialized (runs every 15 mins)");
}

/**
 * 外送訂單定時對帳 Queue
 */
export const deliveryReconcileQueue = new Queue("delivery-reconcile", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

/**
 * 初始化外送訂單對帳排程 (每 5 分鐘執行一次)
 */
export async function initDeliveryReconcileCron(): Promise<void> {
  await deliveryReconcileQueue.upsertJobScheduler(
    "cron-delivery-reconcile",
    {
      pattern: "*/5 * * * *",
    },
    {
      name: "reconcile-orders",
    },
  );

  console.log("⏱️ Delivery Reconcile Cron Scheduler initialized (runs every 5 mins)");
}

//* ─── Delivery Refund Queue ──────────────────────────────────────────────────

export const deliveryRefundQueue = new Queue<DeliveryRefundJobData>(
  "delivery-refund",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
      // 保留紀錄供 jobId 去重：同一外送單在保留期內只會排入一次退款
      removeOnComplete: { age: 30 * 24 * 60 * 60 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    },
  },
);

/** 外送單被 Lalamove 終止（REJECTED / EXPIRED）後排入自動退款；同一外送單以 jobId 去重 */
export async function enqueueDeliveryRefund(
  data: DeliveryRefundJobData,
): Promise<void> {
  await deliveryRefundQueue.add("refund-delivery", data, {
    jobId: `delivery-refund-${data.deliveryOrderId}`,
  });
  console.log(
    `💸 Enqueued refund job for delivery_order #${data.deliveryOrderId} (${data.reason})`,
  );
}

//* ─── Delivery Dispatch Check Queue ──────────────────────────────────────────

export interface DeliveryDispatchCheckJobData {
  deliveryOrderId: number;
}

export const deliveryDispatchCheckQueue = new Queue<DeliveryDispatchCheckJobData>(
  "delivery-dispatch-check",
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  },
);

/**
 * 排定單筆外送單的派單檢查（ORDER_PLACING 未完成時重新派單或判定失敗）。
 * stage 區分「付款後首次檢查」與「結果不明等待期滿」；同一外送單同一 stage 以 jobId 去重。
 */
export async function enqueueDispatchCheck(
  deliveryOrderId: number,
  delayMs: number,
  stage: "initial" | "final",
): Promise<void> {
  await deliveryDispatchCheckQueue.add(
    "check-dispatch",
    { deliveryOrderId },
    { delay: Math.max(0, delayMs), jobId: `dispatch-check-${deliveryOrderId}-${stage}` },
  );
}

/** 關閉本模組建立的所有 Queue 連線；供只作為 producer 的短期程序（例如 benchmark runner）結束時使用 */
export async function closeQueues(): Promise<void> {
  await Promise.all(
    [
      postImageQueue,
      emailQueue,
      embeddingQueue,
      userVectorQueue,
      userVectorFlushQueue,
      hotScoreQueue,
      deliveryReconcileQueue,
      deliveryRefundQueue,
      deliveryDispatchCheckQueue,
    ].map((queue) => queue.close()),
  );
}
