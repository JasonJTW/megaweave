// server/src/queue/queues.ts
// 職責：建立所有 Queue 實例，提供 enqueue helpers 給 route handlers 使用
//* producer

import { Queue } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";
import { PostEmbeddingJobData } from "./jobs/postEmbedding";
import { UserVectorJobData } from "./jobs/userVector";

import { EmailTemplateProps } from "../emails/EmailTemplate";
import { getRedisClient } from "../utils/redis";

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
): Promise<void> {
  await postImageQueue.add("upload-images", data, { delay: 100 });
  console.log(`🖼️ Enqueued upload images job for post #${data.postId}`);
}

export async function enqueuePostDeleteImages(
  data: PostDeleteImageJobData,
): Promise<void> {
  await postImageQueue.add("delete-images", data);
  console.log(`🗑️ Enqueued delete images job for ${data.s3Keys.length} files`);
}

export const emailQueue = new Queue<EmailTemplateProps>("email", {
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
  data: EmailTemplateProps,
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
): Promise<void> {
  await embeddingQueue.add("generate-embedding", data, { delay: 500 });
  console.log(`🧠 Enqueued embedding job for post #${data.postId}`);
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

export async function enqueueUserVectorUpdate(
  data: UserVectorJobData,
): Promise<void> {
  // 對所有 action 進行防抖去重，避免短時間內對同一 (user, post, action) 重複丟 job
  // view: 5 分鐘冷卻（行為輕量，高頻觸發）
  // like / comment / weave: 1 分鐘防抖（理論上不會秒速重複，保險起見）
  const cooldownSeconds =
    data.action === "view"
      ? VIEW_VECTOR_COOLDOWN_SECONDS
      : ACTION_VECTOR_COOLDOWN_SECONDS;

  try {
    const redis = getRedisClient();
    const dedupKey = `user_vector_${data.action}_cd:${data.userId}:${data.postId}`;
    const acquired = await redis.set(dedupKey, "1", {
      NX: true,
      EX: cooldownSeconds,
    });

    if (!acquired) {
      // 還在冷卻期內，忽略重複事件
      return;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to check user-vector ${data.action} cooldown:`, err);
    // Redis 失敗時仍繼續丟 job，避免向量更新完全停擺
  }

  await userVectorQueue.add("update-user-vector", data);
  console.log(
    `👤 Enqueued user-vector job: user #${data.userId} ← post #${data.postId} (${data.action})`,
  );
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
    const redis = getRedisClient();
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


