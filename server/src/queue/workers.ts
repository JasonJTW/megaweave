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


export async function startWorkers(): Promise<void> {
  const postImageWorker = new Worker(
    "post-image",
    async (job: Job<PostUploadImageJobData | PostDeleteImageJobData>) => {
      if (job.name === "upload-images") {
        await processPostUploadImages(job as Job<PostUploadImageJobData>);
      } else if (job.name === "delete-images") {
        await processPostDeleteImages(job as Job<PostDeleteImageJobData>);
      }
    },
    { connection: bullmqConnection },
  );

  postImageWorker.on("completed", (job) => {
    console.log(
      `🎉 [post-image] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  postImageWorker.on("failed", (job, err) => {
    console.error(
      `❌ [post-image] Job ${job?.id} (${job?.name}) failed:`,
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
    { connection: bullmqConnection },
  );

  emailWorker.on("completed", (job) => {
    console.log(
      `🎉 [email-wroker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  emailWorker.on("failed", (job, err) => {
    console.error(
      `❌ [email-wroker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
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
    { connection: bullmqConnection, concurrency: 2 },
  );

  embeddingWorker.on("completed", (job) => {
    console.log(
      `🎉 [embedding-worker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  embeddingWorker.on("failed", (job, err) => {
    console.error(
      `❌ [embedding-worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
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
    { connection: bullmqConnection, concurrency: 5 },
  );

  userVectorWorker.on("completed", (job) => {
    console.log(
      `🎉 [user-vector-worker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  userVectorWorker.on("failed", (job, err) => {
    console.error(
      `❌ [user-vector-worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
    );
  });

  // ─── Hot Score Worker ──────────────────────────────────────────────────
  const hotScoreWorker = new Worker(
    "hot-score",
    async (job: Job) => {
      if (job.name === "calculate-hot-score") {
        await processCalculateHotScore(job);
      }
    },
    { connection: bullmqConnection, concurrency: 1 },
  );

  hotScoreWorker.on("completed", (job) => {
    console.log(
      `🎉 [hot-score-worker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  hotScoreWorker.on("failed", (job, err) => {
    console.error(
      `❌ [hot-score-worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
    );
  });

  // ─── User Vector Flush Worker (Write-Back cron) ────────────────────────
  const userVectorFlushWorker = new Worker(
    "user-vector-flush",
    async (job: Job) => {
      if (job.name === "flush-user-vectors") {
        await processUserVectorFlush(job);
      }
    },
    // concurrency: 1 — 確保同一時間只有一個 flush job 操作 dirty set，
    // 避免多個 worker 同時 SPOP 造成資料競態。
    { connection: bullmqConnection, concurrency: 1 },
  );

  userVectorFlushWorker.on("completed", (job) => {
    console.log(
      `🎉 [vector-flush-worker] Job ${job.id} (${job.name}) finished successfully`,
    );
  });

  userVectorFlushWorker.on("failed", (job, err) => {
    console.error(
      `❌ [vector-flush-worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`,
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
    { connection: bullmqConnection, concurrency: 1 },
  );

  deliveryReconcileWorker.on("completed", (_job, result) => {
    const timeStr = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    const res = result as { checkedCount?: number; reconciledCount?: number; expiredCount?: number } | undefined;
    const stats =
      res && typeof res.checkedCount === "number"
        ? ` (Checked: ${res.checkedCount}, Reconciled: ${res.reconciledCount}, Expired: ${res.expiredCount ?? 0})`
        : "";
    console.log(`🎉 [delivery-reconcile] Reconcile finished at ${timeStr}${stats}`);
  });

  deliveryReconcileWorker.on("failed", (_job, err) => {
    const timeStr = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    console.error(
      `❌ [delivery-reconcile] Reconcile failed at ${timeStr}: ${err.message}`,
    );
  });

  // 啟動外送訂單對帳排程 (每 5 分鐘一次)
  await initDeliveryReconcileCron();

  console.log("🚀 All workers started");
}
