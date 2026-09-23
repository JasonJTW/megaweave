import { Worker, Job } from "bullmq";
import { bullmqConnection } from "./connection";
import {
  processPostUploadImages,
  processPostDeleteImages,
  PostUploadImageJobData,
  PostDeleteImageJobData,
} from "./jobs/postImage";
import { processSendEmail } from "./jobs/email";
import { EmailTemplateProps } from "../emails/EmailTemplate";
import {
  processPostEmbedding,
  PostEmbeddingJobData,
} from "./jobs/postEmbedding";
import {
  processUserVector,
  UserVectorJobData,
} from "./jobs/userVector";
import { processUserVectorFlush } from "./jobs/userVectorFlush";
import { processCalculateHotScore } from "./jobs/hotScore";
import { processDeliveryReconciliation } from "./jobs/deliveryReconcile";
import { initUserVectorFlushCron, initDeliveryReconcileCron } from "./queues";
import { WORKER_CONCURRENCY } from "./concurrency";


/**
 * 格式化時間為 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * 將 BullMQ repeatable job ID（例如 repeat:cron-flush-user-vectors:1788696600000）
 * 中的毫秒時間戳轉為好讀的時間格式：
 * "repeat:cron-flush-user-vectors (2026-09-06 20:10:00)"
 */
function formatJobId(jobId?: string): string {
  if (!jobId) return "unknown";
  const match = jobId.match(/^(repeat:[^:]+):(\d{10,13})$/);
  if (match) {
    const [, name, timestampStr] = match;
    const date = new Date(Number(timestampStr));
    if (!isNaN(date.getTime())) {
      return `${name} (${formatDateTime(date)})`;
    }
  }
  return jobId;
}

let activeWorkers: Worker[] = [];

export function getActiveWorkers(): Worker[] {
  return [...activeWorkers];
}

export async function stopWorkers(): Promise<void> {
  if (activeWorkers.length === 0) return;
  console.log(`🛑 Stopping ${activeWorkers.length} BullMQ workers...`);
  const workersToClose = [...activeWorkers];
  activeWorkers = [];
  await Promise.all(workersToClose.map((w) => w.close()));
  console.log("✅ All BullMQ workers stopped");
}

export async function startWorkers(): Promise<void> {
  // 避免重複啟動多組 worker
  if (activeWorkers.length > 0) {
    console.warn("⚠️ Workers already running, stopping existing workers first...");
    await stopWorkers();
  }

  const postImageWorker = new Worker(
    "post-image",
    async (job: Job<PostUploadImageJobData | PostDeleteImageJobData>) => {
      if (job.name === "upload-images") {
        await processPostUploadImages(job as Job<PostUploadImageJobData>);
      } else if (job.name === "delete-images") {
        await processPostDeleteImages(job as Job<PostDeleteImageJobData>);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["post-image"] },
  );

  postImageWorker.on("completed", (job) => {
    console.log(
      `🎉 [post-image] Job ${formatJobId(job.id)} (${job.name}) finished successfully`,
    );
  });

  postImageWorker.on("failed", (job, err) => {
    console.error(
      `❌ [post-image] Job ${formatJobId(job?.id)} (${job?.name}) failed:`,
      err.message,
    );
  });

  const emailWorker = new Worker<EmailTemplateProps>(
    "email",
    async (job: Job<EmailTemplateProps>) => {
      if (job.name === "send-email") {
        await processSendEmail(job);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY.email },
  );

  emailWorker.on("completed", (job) => {
    console.log(
      `🎉 [email-worker] Job ${formatJobId(job.id)} (${job.name}) finished successfully`,
    );
  });

  emailWorker.on("failed", (job, err) => {
    console.error(
      `❌ [email-worker] Job ${formatJobId(job?.id)} (${job?.name}) failed: ${err.message}`,
    );
  });

  // ─── Embedding Worker ──────────────────────────────────────────────────
  const embeddingWorker = new Worker<PostEmbeddingJobData>(
    "post-embedding",
    async (job: Job<PostEmbeddingJobData>) => {
      if (job.name === "generate-embedding") {
        await processPostEmbedding(job);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["post-embedding"] },
  );

  embeddingWorker.on("completed", (job) => {
    console.log(
      `🎉 [embedding-worker] Job ${formatJobId(job.id)} (${job.name}) finished successfully`,
    );
  });

  embeddingWorker.on("failed", (job, err) => {
    console.error(
      `❌ [embedding-worker] Job ${formatJobId(job?.id)} (${job?.name}) failed: ${err.message}`,
    );
  });

  // ─── User Vector Worker ────────────────────────────────────────────────
  const userVectorWorker = new Worker<UserVectorJobData>(
    "user-vector",
    async (job: Job<UserVectorJobData>) => {
      if (job.name === "update-user-vector") {
        await processUserVector(job);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["user-vector"] },
  );

  userVectorWorker.on("completed", (job) => {
    console.log(
      `🎉 [user-vector-worker] Job ${formatJobId(job.id)} (${job.name}) finished successfully`,
    );
  });

  userVectorWorker.on("failed", (job, err) => {
    console.error(
      `❌ [user-vector-worker] Job ${formatJobId(job?.id)} (${job?.name}) failed: ${err.message}`,
    );
  });

  // ─── Hot Score Worker ──────────────────────────────────────────────────
  const hotScoreWorker = new Worker(
    "hot-score",
    async (job: Job) => {
      if (job.name === "calculate-hot-score") {
        return await processCalculateHotScore(job);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["hot-score"] },
  );

  hotScoreWorker.on("completed", (job, result) => {
    const timeStr = formatDateTime();
    const res = result as { postCount?: number; trendingCount?: number } | undefined;
    const stats =
      res && typeof res.postCount === "number"
        ? ` (Posts: ${res.postCount}, Trending: ${res.trendingCount})`
        : "";
    console.log(
      `🎉 [hot-score-worker] Job ${formatJobId(job.id)} (${job.name}) finished at ${timeStr}${stats}`,
    );
  });

  hotScoreWorker.on("failed", (job, err) => {
    const timeStr = formatDateTime();
    console.error(
      `❌ [hot-score-worker] Job ${formatJobId(job?.id)} (${job?.name}) failed at ${timeStr}: ${err.message}`,
    );
  });

  // ─── User Vector Flush Worker (Write-Back cron) ────────────────────────
  const userVectorFlushWorker = new Worker(
    "user-vector-flush",
    async (job: Job) => {
      if (job.name === "flush-user-vectors") {
        return await processUserVectorFlush(job);
      }
    },
    // concurrency 1 — 確保同一時間只有一個 flush job 操作 dirty set，
    // 避免多個 worker 同時 SPOP 造成資料競態。
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["user-vector-flush"] },
  );

  userVectorFlushWorker.on("completed", (job, result) => {
    const res = result as { flushedCount?: number } | undefined;
    // 只有在真正有向量寫入 MySQL (flushedCount > 0) 時才輸出到 terminal
    // 若為 0 件，保持安靜，詳細紀錄保留在 BullMQ job.log
    if (res && (res.flushedCount ?? 0) > 0) {
      const timeStr = formatDateTime();
      console.log(
        `🎉 [vector-flush-worker] Job ${formatJobId(job.id)} (${job.name}) finished at ${timeStr} (Flushed: ${res.flushedCount})`,
      );
    }
  });

  userVectorFlushWorker.on("failed", (job, err) => {
    const timeStr = formatDateTime();
    console.error(
      `❌ [vector-flush-worker] Job ${formatJobId(job?.id)} (${job?.name}) failed at ${timeStr}: ${err.message}`,
    );
  });

  // 啟動 Write-Back flush cron 排程（每 10 分鐘把 Redis dirty set 批次寫回 MySQL）
  await initUserVectorFlushCron();

  // ─── Delivery Reconcile Worker (每 5 分鐘主動檢查遺失的 Webhook) ───────
  const deliveryReconcileWorker = new Worker(
    "delivery-reconcile",
    async (job: Job) => {
      if (job.name === "reconcile-orders") {
        return await processDeliveryReconciliation(job);
      }
    },
    { connection: bullmqConnection, concurrency: WORKER_CONCURRENCY["delivery-reconcile"] },
  );

  deliveryReconcileWorker.on("completed", (job, result) => {
    const res = result as { checkedCount?: number; reconciledCount?: number; expiredCount?: number } | undefined;
    // 只有在真正有訂單對帳更新或過期時才輸出到 terminal
    // 平常 0 件時完全安靜，詳細紀錄保留在 BullMQ job.log
    if (res && ((res.reconciledCount ?? 0) > 0 || (res.expiredCount ?? 0) > 0)) {
      const timeStr = formatDateTime();
      console.log(
        `🎉 [delivery-reconcile] Job ${formatJobId(job.id)} finished at ${timeStr} (Checked: ${res.checkedCount}, Reconciled: ${res.reconciledCount}, Expired: ${res.expiredCount ?? 0})`,
      );
    }
  });

  deliveryReconcileWorker.on("failed", (job, err) => {
    const timeStr = formatDateTime();
    console.error(
      `❌ [delivery-reconcile] Job ${formatJobId(job?.id)} failed at ${timeStr}: ${err.message}`,
    );
  });

  // 啟動外送訂單對帳排程 (每 5 分鐘一次)
  await initDeliveryReconcileCron();

  activeWorkers = [
    postImageWorker,
    emailWorker,
    embeddingWorker,
    userVectorWorker,
    hotScoreWorker,
    userVectorFlushWorker,
    deliveryReconcileWorker,
  ];

  console.log("🚀 All workers started");
}
