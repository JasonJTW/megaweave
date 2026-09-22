// server/src/benchmark/queue/queueBurstProfile.ts
// queue-burst-* profile：在低量且持續的 feed 與貼文建立流量下，送入代表性的圖片、貼文向量與使用者向量工作，
// 量測非同步處理能力（等待 / 處理時間、重試、峰值深度、清空 backlog 時間）與使用者端延遲的變化，
// 最後以持久化結果驗證沒有遺失或重複的工作。OpenAI 與 S3 由 runner 啟動的 loopback mock 取代。

import { randomUUID } from "crypto";
import type { Queue } from "bullmq";
import type Redis from "ioredis";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { BenchmarkSafetyError } from "../errors";
import type { BenchmarkProfile, BenchmarkProfileOutcome } from "../profiles";
import type { AppStores } from "../fixture/fixtureProfile";
import { EMBEDDING_MODEL_VERSION } from "../fixture/embeddings";
import { DEFAULT_FIXTURE_SEED } from "../fixture/generateFixture";
import { deriveSeed } from "../fixture/random";
import { BURST_IMAGE_COUNT_WEIGHTS, BurstUnit, INTERACTION_MIX } from "./burstPlan";
import type { MockOpenAi } from "../mocks/mockOpenAi";
import type { MockS3 } from "../mocks/mockS3";
import type { JobAccounting, JobState, SubmittedJob } from "./accounting";
import type { TrafficPhase } from "./phases";
import { CREATE_POST_PATH, PRESIGNED_URLS_PATH } from "./traffic";
import { FEED_PATH } from "../feed/load";
import { MAX_SCROLL_PAGES, SCROLL_PROBABILITY, VIEW_MIX } from "../feed/workload";

export const BURST_QUEUES = ["post-image", "post-embedding", "user-vector"] as const;
const JOBS_PER_UNIT = BURST_QUEUES.length;
/** mock 只綁定 127.0.0.1；S3 SDK 只對 IP 端點使用 path-style，因此不接受 localhost */
const MOCK_HOST = "127.0.0.1";
const BENCHMARK_QUEUE_MARKER_KEY = "benchmark:environment";
const QUEUE_IDLE_TIMEOUT_MS = 60_000;
const TRAFFIC_JOBS_TIMEOUT_MS = 120_000;
const MAX_FAILED_SAMPLES = 50;

const MOCK_LATENCY_MS = {
  openaiEmbeddings: { min: 150, max: 450 },
  s3: { min: 20, max: 80 },
};
const SAMPLE_IMAGE = { width: 2048, height: 1536 };

const UNAVAILABLE_METRICS = {
  "worker.cpuAndMemory": "not sampled: the worker exposes no metrics endpoint; use docker stats or ps alongside the run",
  "mysql.serverCpu": "not sampled: the runner does not read container or host metrics; use docker stats alongside the run",
  "redis.serverCpu": "not sampled: see mysql.serverCpu",
  "api.containerCpuAndMemory": "reported as API process CPU time and RSS/heap from /health, not container cgroup usage",
};

export interface QueueBurstPlan {
  /** 「一篇附圖新貼文 + 一次互動」的數量；每個單位產生 3 個 job */
  units: number;
  /** 所有工作平均分散在此時間內送入 */
  injectionMs: number;
  /** burst 前只有使用者流量的基準期 */
  baselineMs: number;
  /** 所有 burst 工作完成後繼續量測使用者流量的時間 */
  recoveryMs: number;
  /** burst 工作未在此時間內全部終止時停止等待，並以未完成回報 */
  drainTimeoutMs: number;
  feedVirtualUsers: number;
  postVirtualUsers: number;
  feedThinkTimeMs: { min: number; max: number };
  postThinkTimeMs: { min: number; max: number };
  depthSampleIntervalMs: number;
}

export interface QueueBurstProfileOptions {
  name: string;
  posts: number;
  plan: QueueBurstPlan;
  seed?: number;
}

interface MockEndpoints {
  openAiPort: number;
  s3Port: number;
  bucket: string;
  stagingBucket: string;
}

const mockUrlSchema = z
  .string({ error: "is required; load server/benchmark.env" })
  .transform((value, ctx) => {
    try {
      return new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "must be a URL" });
      return z.NEVER;
    }
  })
  .refine((url) => url.hostname === MOCK_HOST && url.port !== "", {
    message: `must point to a benchmark mock on ${MOCK_HOST} with an explicit port`,
  })
  .transform((url) => Number(url.port));

const mockEnvironmentSchema = z.object({
  OPENAI_BASE_URL: mockUrlSchema,
  AWS_ENDPOINT_URL_S3: mockUrlSchema,
  BUCKET_NAME: z.string({ error: "is required; load server/benchmark.env" }).min(1),
  STAGING_BUCKET_NAME: z.string({ error: "is required; load server/benchmark.env" }).min(1),
});

/** API 與 worker 讀取同一份 benchmark.env；外部服務端點必須指向本機 mock，否則拒絕執行 */
function resolveMockEndpoints(): MockEndpoints {
  const parsed = mockEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ");
    throw new BenchmarkSafetyError(`Unsafe external service configuration: ${issues}`);
  }
  return {
    openAiPort: parsed.data.OPENAI_BASE_URL,
    s3Port: parsed.data.AWS_ENDPOINT_URL_S3,
    bucket: parsed.data.BUCKET_NAME,
    stagingBucket: parsed.data.STAGING_BUCKET_NAME,
  };
}

interface BurstCandidatesRow {
  userIds: number[];
  interactionPostIds: number[];
  locations: { id: number; province: string; city: string }[];
}

async function loadBurstCandidates(mysql: Pool): Promise<BurstCandidatesRow> {
  const [[users], [posts], [locations]] = await Promise.all([
    mysql.query<RowDataPacket[]>("SELECT id FROM users ORDER BY id"),
    mysql.query<RowDataPacket[]>(
      "SELECT id FROM posts WHERE status = 'active' AND deleted_at IS NULL AND embedding IS NOT NULL ORDER BY id",
    ),
    mysql.query<RowDataPacket[]>("SELECT id, province, city FROM locations ORDER BY id"),
  ]);
  return {
    userIds: users.map((row) => Number(row.id)),
    interactionPostIds: posts.map((row) => Number(row.id)),
    locations: locations.map((row) => ({ id: Number(row.id), province: String(row.province), city: String(row.city) })),
  };
}

interface BurstPost {
  unit: BurstUnit;
  postId: number;
  stagingKeys: string[];
  s3Keys: string[];
}

/**
 * 以 production createPost 相同的欄位寫入 burst 貼文（貼文、物品、圖片 key），等同 API 已提交交易、尚待 worker 處理的狀態。
 * 寫入在量測開始前完成，burst 只量測 queue 與 worker。
 */
async function insertBurstPosts(mysql: Pool, units: readonly BurstUnit[], runId: string): Promise<BurstPost[]> {
  const connection = await mysql.getConnection();
  try {
    await connection.beginTransaction();
    const posts: BurstPost[] = [];
    for (const unit of units) {
      const { post } = unit;
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO posts (
           public_id, user_id, title, content, status, type, location_id, tags,
           category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
         ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW(), NOW(), 0, 0)`,
        [randomUUID(), post.userId, post.title, post.content, post.type, post.location?.id ?? null, post.tags,
          post.categoryId, post.conditionLevel],
      );
      const postId = result.insertId;
      await connection.query("INSERT INTO items (post_id, title, quantity, created_at, updated_at) VALUES ?", [
        post.items.map((item) => [postId, item.title, item.quantity, new Date(), new Date()]),
      ]);
      const serial = String(unit.index + 1).padStart(4, "0");
      const stagingKeys = Array.from({ length: unit.images }, (_, i) => `staging/posts/benchmark-${runId}-${serial}-${i + 1}.jpg`);
      const s3Keys = Array.from({ length: unit.images }, (_, i) => `posts/benchmark-${runId}-${serial}-${i + 1}.webp`);
      await connection.query("INSERT INTO images (post_id, s3_key, alt_text, created_at) VALUES ?", [
        s3Keys.map((key) => [postId, key, `Image for post ${postId}`, new Date()]),
      ]);
      posts.push({ unit, postId, stagingKeys, s3Keys });
    }
    await connection.commit();
    return posts;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPosterSessions(stores: AppStores, count: number) {
  const { createBenchmarkSessions } = await import("../feed/sessions");
  // 以編號最大的使用者發文，與 feed persona（編號最小）錯開
  const [users] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT id, public_id, username, email, avatar_url, created_at FROM users ORDER BY id DESC LIMIT ?",
    [count],
  );
  const [locations] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT place_id, full_address, province, city, lat, lng FROM locations ORDER BY id LIMIT ?",
    [count],
  );
  const sessionIds = await createBenchmarkSessions(
    stores.cacheRedis,
    users.map((user) => ({
      id: Number(user.id),
      public_id: String(user.public_id),
      username: String(user.username),
      email: String(user.email),
      avatar_url: user.avatar_url ? String(user.avatar_url) : null,
      created_at: new Date(user.created_at),
    })),
  );
  return sessionIds.map((sessionId, index) => {
    const location = locations[index % locations.length];
    return {
      sessionId,
      location: {
        place_id: String(location.place_id),
        full_address: String(location.full_address),
        province: String(location.province),
        city: String(location.city),
        lat: Number(location.lat),
        lng: Number(location.lng),
      },
    };
  });
}

/** 清掉先前中斷執行殘留、尚未處理的工作，讓深度與帳目只反映本次執行；回傳清掉的數量 */
async function drainQueues(queues: readonly Queue[]): Promise<Record<string, number>> {
  const leftover: Record<string, number> = {};
  for (const queue of queues) {
    const counts = await queue.getJobCounts("waiting", "delayed", "prioritized");
    leftover[queue.name] = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    await queue.drain(true);
  }
  return leftover;
}

/** 等待仍在處理中的殘留 job 結束 */
async function waitForIdleQueues(queues: readonly Queue[]): Promise<void> {
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

async function requireWorkers(queues: readonly Queue[]): Promise<Record<string, number>> {
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

async function observeDurableState(
  stores: AppStores,
  s3: MockS3,
  buckets: { bucket: string; stagingBucket: string },
  postIds: number[],
  stagingKeys: string[],
  userIds: number[],
) {
  const [embeddingRows] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT id, JSON_LENGTH(embedding) AS dimensions FROM posts WHERE id IN (?)",
    [postIds],
  );
  const [imageRows] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT post_id, s3_key FROM images WHERE post_id IN (?) ORDER BY id",
    [postIds],
  );
  const vectorBytes = await Promise.all(postIds.map((id) => stores.vectorRedis.hStrLen(`post:${id}`, "v")));
  const userUpdatedAt = await Promise.all(userIds.map((id) => stores.vectorRedis.hGet(`user:${id}:vector`, "updated_at")));

  const dimensions = new Map(embeddingRows.map((row) => [Number(row.id), row.dimensions === null ? null : Number(row.dimensions)]));
  const imageKeysByPost = new Map<number, string[]>();
  for (const row of imageRows) {
    const keys = imageKeysByPost.get(Number(row.post_id)) ?? [];
    keys.push(String(row.s3_key));
    imageKeysByPost.set(Number(row.post_id), keys);
  }
  return {
    embeddings: new Map(
      postIds.map((id, index) => [id, { mysqlDimensions: dimensions.get(id) ?? null, redisVectorBytes: Number(vectorBytes[index]) }]),
    ),
    imageKeysByPost,
    storage: {
      uploadsByKey: s3.uploads(buckets.bucket),
      remainingStagingKeys: new Set(stagingKeys.filter((key) => s3.hasObject(buckets.stagingBucket, key))),
    },
    userVectorUpdatedAtMs: new Map(userIds.map((id, index) => [id, userUpdatedAt[index] ? Number(userUpdatedAt[index]) : null])),
  };
}

function trafficJobsTerminal(accounting: JobAccounting): boolean {
  const traffic = accounting.byOrigin.traffic.total;
  return traffic.unfinished === 0 && traffic.unobserved === 0;
}

export function createQueueBurstProfile(options: QueueBurstProfileOptions): BenchmarkProfile {
  const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
  const fixtureOptions = { posts: options.posts, seed };
  const { plan } = options;
  let stores: AppStores | null = null;
  let queueRedis: Redis | null = null;
  let endpoints: MockEndpoints | null = null;
  let mocks: { openAi: MockOpenAi; s3: MockS3 } | null = null;
  let sessionIds: string[] = [];
  let queuesLoaded = false;

  return {
    name: options.name,
    description:
      `Injects ${plan.units} post/interaction units of image, embedding, and user-vector work ` +
      `while feed and post-creation traffic continues, on a deterministic ${options.posts}-post fixture`,
    touchesTarget: true,
    workload: {
      operation: "queue-burst-under-api-traffic",
      fixture: { ...fixtureOptions, embeddings: EMBEDDING_MODEL_VERSION },
      burst: {
        units: plan.units,
        unitDefinition:
          "one new post with 1-5 staged images (post-image upload-images + post-embedding generate-embedding jobs) " +
          "plus one interaction by a fixture user on an embedded fixture post (user-vector update-user-vector job)",
        jobsPerUnit: { "post-image": 1, "post-embedding": 1, "user-vector": 1 },
        imageCountWeights: Object.fromEntries(BURST_IMAGE_COUNT_WEIGHTS),
        interactionMix: Object.fromEntries(INTERACTION_MIX),
        injectionSeconds: plan.injectionMs / 1000,
        injection: "units are spread evenly over the injection window and enqueued with the production enqueue helpers (same job names, delays, attempts, and backoff)",
        setup: "burst posts, items, and image rows are written to MySQL and their staging images placed in the mock S3 before measurement, as a committed createPost would leave them",
        sourceImage: { format: "jpeg", ...SAMPLE_IMAGE, content: "synthetic gradient with noise; no real photos" },
      },
      traffic: {
        feed: {
          endpoint: `GET ${FEED_PATH}`,
          virtualUsers: plan.feedVirtualUsers,
          thinkTimeSeconds: { min: plan.feedThinkTimeMs.min / 1000, max: plan.feedThinkTimeMs.max / 1000, distribution: "uniform" },
          personas: "same pattern as feed-10k: per 10 virtual users 5 returning, 2 cold-start, 3 anonymous (half without location)",
          viewMix: Object.fromEntries(VIEW_MIX),
          scrollProbability: SCROLL_PROBABILITY,
          maxScrollPages: MAX_SCROLL_PAGES,
          strategy: "production default (late-materialization); no strategy header",
        },
        postCreation: {
          flow: `POST ${PRESIGNED_URLS_PATH} → PUT each image to its presigned URL (mock S3) → POST ${CREATE_POST_PATH}`,
          virtualUsers: plan.postVirtualUsers,
          thinkTimeSeconds: { min: plan.postThinkTimeMs.min / 1000, max: plan.postThinkTimeMs.max / 1000, distribution: "uniform" },
          imageCountWeights: Object.fromEntries(BURST_IMAGE_COUNT_WEIGHTS),
          measuredRequests: "post-presign and post-create; the staging upload goes to S3, not the API, and is recorded only when it fails",
        },
        loop: "closed loop: each virtual user waits for the response and a think time before the next action",
      },
      phases: {
        before: `${plan.baselineMs / 1000}s of user traffic only`,
        burst: "from the first burst enqueue until every burst job is completed or terminally failed",
        after: `${plan.recoveryMs / 1000}s of user traffic after the burst backlog cleared`,
        drainTimeoutSeconds: plan.drainTimeoutMs / 1000,
      },
      depthSampleIntervalSeconds: plan.depthSampleIntervalMs / 1000,
      mockLatencyMs: MOCK_LATENCY_MS,
      metricDefinitions: {
        queueWait: "first start minus enqueue, from the BullMQ event stream (Redis clock); includes the producer's scheduled delay (upload-images 100 ms, generate-embedding 500 ms)",
        processing: "finish minus start of the final attempt",
        retries: "attempts beyond the first, including re-processing after a stall",
        terminalFailure: "a job that exhausted its attempts",
        peakDepth: "max sampled waiting + delayed + prioritized + active jobs",
        timeToZeroBacklog: "from the last burst enqueue until the last burst job reached a terminal state",
      },
    },
    dependencies: { mysql: "benchmark", redis: "benchmark", openai: "mock", s3: "mock" },

    async assertSafeToRun() {
      endpoints = resolveMockEndpoints();
      const { openAppStores } = await import("../fixture/fixtureProfile");
      const { assertBenchmarkDataStores, assertBenchmarkMysql, BENCHMARK_DATA_MARKER } = await import("../fixture/dataStoreGuard");
      stores = await openAppStores();
      await assertBenchmarkMysql(stores.mysql);
      await stores.connectRedis();
      await assertBenchmarkDataStores(stores);

      // runner 會清空 queue 殘留工作並送入 job；queue Redis 也必須帶有 benchmark 標記
      const { default: IORedis } = await import("ioredis");
      const { bullmqConnection } = await import("../../queue/connection");
      queueRedis = new IORedis({ ...bullmqConnection, maxRetriesPerRequest: 1, lazyConnect: true });
      let marker: string | null = null;
      try {
        await queueRedis.connect();
        marker = await queueRedis.get(BENCHMARK_QUEUE_MARKER_KEY);
      } catch {
        throw new BenchmarkSafetyError("Unable to verify the queue Redis benchmark marker");
      }
      if (marker !== BENCHMARK_DATA_MARKER) {
        throw new BenchmarkSafetyError(
          `queue Redis is missing ${BENCHMARK_QUEUE_MARKER_KEY}=${BENCHMARK_DATA_MARKER}; refusing to enqueue into a non-benchmark instance`,
        );
      }
    },

    async run({ targetUrl }): Promise<BenchmarkProfileOutcome> {
      const target = targetUrl!;
      const activeStores = stores!;
      const redis = queueRedis!;
      const buckets = endpoints!;
      const log = (message: string) => console.log(`[queue-burst] ${message}`);

      const { startMockOpenAi } = await import("../mocks/mockOpenAi");
      const { startMockS3 } = await import("../mocks/mockS3");
      const { prepareFixture } = await import("../fixture/fixtureProfile");
      const { describeEnvironment, preparePersonas, resetTargetCaches } = await import("../feed/feedProfile");
      const { sessionCookieName } = await import("../feed/sessions");
      const { takeSnapshot, diffSnapshots, startApiMemorySampler } = await import("../feed/observations");
      const { generateBurstPlan } = await import("./burstPlan");
      const { createSampleImage } = await import("./sampleImage");
      const { startQueueObserver, waitFor } = await import("./observer");
      const { runTraffic } = await import("./traffic");
      const { accountJobs } = await import("./accounting");
      const { summarizeBacklog } = await import("./backlog");
      const { summarizeTrafficPhases } = await import("./phases");
      const { evaluateConsistency } = await import("./consistency");
      const { renderQueueBurstSummary } = await import("./summary");
      const { evaluateQueueBurstInvariants } = await import("./invariants");
      const { WORKER_CONCURRENCY } = await import("../../queue/concurrency");
      const queueModule = await import("../../queue/queues");
      queuesLoaded = true;
      const queues = [queueModule.postImageQueue, queueModule.embeddingQueue, queueModule.userVectorQueue];

      mocks = {
        openAi: await startMockOpenAi({ port: buckets.openAiPort, latencyMs: MOCK_LATENCY_MS.openaiEmbeddings, seed: deriveSeed(seed, "mock-openai") }),
        s3: await startMockS3({
          port: buckets.s3Port,
          latencyMs: MOCK_LATENCY_MS.s3,
          seed: deriveSeed(seed, "mock-s3"),
          retainBody: (bucket) => bucket === buckets.stagingBucket,
        }),
      };

      const workerConnections = await requireWorkers(queues);
      // 先清掉殘留工作，避免 worker 在 fixture 重新載入期間以舊的貼文 ID 處理它們
      const leftoverJobs = await drainQueues(queues);
      await waitForIdleQueues(queues);
      const fixture = await prepareFixture(activeStores, fixtureOptions);
      // fixture 重新載入後，API 記憶體中的向量快取已過期
      await resetTargetCaches(target);

      const image = await createSampleImage({ ...SAMPLE_IMAGE, seed: deriveSeed(seed, "queue-burst-image") });
      const units = generateBurstPlan({ seed, units: plan.units, candidates: await loadBurstCandidates(activeStores.mysql) });
      // 每次執行的 S3 key 不同，mock S3 的上傳計數不會與先前執行混淆
      const runId = randomUUID().slice(0, 8);
      const burstPosts = await insertBurstPosts(activeStores.mysql, units, runId);
      for (const post of burstPosts) {
        for (const key of post.stagingKeys) mocks.s3.putObject(buckets.stagingBucket, key, image.buffer);
      }
      log(`prepared ${burstPosts.length} burst posts with ${burstPosts.reduce((n, p) => n + p.stagingKeys.length, 0)} staged images`);

      const personas = await preparePersonas(activeStores, plan.feedVirtualUsers);
      const posters = await createPosterSessions(activeStores, plan.postVirtualUsers);
      sessionIds = [...personas.sessionIds, ...posters.map((poster) => poster.sessionId)];
      const environment = await describeEnvironment(activeStores);

      const observer = await startQueueObserver(queues, redis, plan.depthSampleIntervalMs);
      const submitted: SubmittedJob[] = [];
      const jobIdsByUnit = new Map<number, { image?: string; embedding?: string; userVector?: string }>();
      let deduplicated = 0;
      const stopTraffic = new AbortController();
      const snapshot = () => takeSnapshot({ ...activeStores, targetUrl: target });
      const phaseObservations: Record<string, ReturnType<typeof diffSnapshots>> = {};
      const phases: TrafficPhase[] = [];
      let injectionStartedAt = 0;
      let injectionEndedAt = 0;
      let drained = false;

      const traffic = runTraffic({
        targetUrl: target,
        sessionCookieName: sessionCookieName(),
        catalog: personas.catalog,
        feedUsers: personas.personas.map((persona, index) => ({ persona, seed: deriveSeed(seed, "queue-burst-feed", index) })),
        posters: posters.map((poster, index) => ({ ...poster, seed: deriveSeed(seed, "queue-burst-poster", index) })),
        feedThinkTimeMs: plan.feedThinkTimeMs,
        postThinkTimeMs: plan.postThinkTimeMs,
        imageCountWeights: BURST_IMAGE_COUNT_WEIGHTS,
        image: image.buffer,
        signal: stopTraffic.signal,
      });

      const measurePhase = async (name: string, until: () => Promise<void>) => {
        const sampler = startApiMemorySampler(target);
        const start = await snapshot();
        const startMs = Date.now();
        await until();
        const endMs = Date.now();
        const end = await snapshot();
        phases.push({ name, startMs, endMs });
        phaseObservations[name] = diffSnapshots(start, end, sampler.stop());
        log(`${name} phase: ${Math.round((endMs - startMs) / 1000)}s`);
      };

      const burstTerminal = () => {
        const accounting = accountJobs({ submitted, events: observer.events });
        const burst = accounting.byOrigin.burst.total;
        return submitted.length === plan.units * JOBS_PER_UNIT - deduplicated && burst.unfinished === 0 && burst.unobserved === 0;
      };

      try {
        await measurePhase("before", () => new Promise((resolve) => setTimeout(resolve, plan.baselineMs)));

        await measurePhase("burst", async () => {
          injectionStartedAt = Date.now();
          for (const post of burstPosts) {
            const due = injectionStartedAt + (post.unit.index * plan.injectionMs) / burstPosts.length;
            const wait = due - Date.now();
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            const { unit } = post;
            const imageJob = await queueModule.enqueuePostUploadImages({
              postId: post.postId,
              files: post.s3Keys.map((s3Key, i) => ({ s3Key, stagingKey: post.stagingKeys[i] })),
            });
            const embeddingJob = await queueModule.enqueuePostEmbedding({
              postId: post.postId,
              post: {
                title: unit.post.title,
                content: unit.post.content,
                type: unit.post.type,
                categoryId: unit.post.categoryId,
                conditionLevel: unit.post.conditionLevel,
                tags: unit.post.tags,
                items: unit.post.items,
                city: unit.post.location?.city,
                province: unit.post.location?.province,
              },
            });
            const userVectorJob = await queueModule.enqueueUserVectorUpdate(unit.interaction);
            if (!userVectorJob) deduplicated++;
            const ids = { image: imageJob.id, embedding: embeddingJob.id, userVector: userVectorJob?.id };
            jobIdsByUnit.set(unit.index, ids);
            submitted.push({ queue: "post-image", jobId: String(ids.image), origin: "burst" });
            submitted.push({ queue: "post-embedding", jobId: String(ids.embedding), origin: "burst" });
            if (ids.userVector) submitted.push({ queue: "user-vector", jobId: String(ids.userVector), origin: "burst" });
          }
          injectionEndedAt = Date.now();
          log(`enqueued ${submitted.length} burst jobs in ${Math.round((injectionEndedAt - injectionStartedAt) / 1000)}s; waiting for the backlog to clear`);
          drained = await waitFor(burstTerminal, plan.drainTimeoutMs, 200);
        });

        await measurePhase("after", () => new Promise((resolve) => setTimeout(resolve, plan.recoveryMs)));
      } finally {
        stopTraffic.abort();
      }
      const { samples, createdPosts } = await traffic;

      // 等待使用者流量排入的工作也完成，才能檢查其持久化結果
      await waitFor(() => trafficJobsTerminal(accountJobs({ submitted, events: observer.events })), TRAFFIC_JOBS_TIMEOUT_MS, 250);
      await observer.stop();

      const accounting = accountJobs({ submitted, events: observer.events });
      const backlog = summarizeBacklog(observer.depthSamples, { injectionStartedAtMs: injectionStartedAt, injectionEndedAtMs: injectionEndedAt });
      const trafficPhases = summarizeTrafficPhases(samples, phases);

      const stateOf = (queue: string, jobId: string | undefined): JobState =>
        accounting.jobs.find((job) => job.queue === queue && job.jobId === jobId)?.state ?? "unobserved";
      const trafficState: JobState = trafficJobsTerminal(accounting) && accounting.byOrigin.traffic.total.terminalFailed === 0 ? "completed" : "unfinished";
      const expectedPosts = [
        ...burstPosts.map((post) => {
          const ids = jobIdsByUnit.get(post.unit.index);
          return {
            postId: post.postId,
            origin: "burst" as const,
            stagingKeys: post.stagingKeys,
            embeddingJob: stateOf("post-embedding", ids?.embedding),
            imageJob: stateOf("post-image", ids?.image),
          };
        }),
        ...createdPosts.map((post) => ({
          postId: post.postId,
          origin: "traffic" as const,
          stagingKeys: post.stagingKeys,
          embeddingJob: trafficState,
          imageJob: trafficState,
        })),
      ];
      const userVectors = [...jobIdsByUnit.entries()].map(([index, ids]) => ({
        userId: units[index].interaction.userId,
        job: ids.userVector ? stateOf("user-vector", ids.userVector) : ("unobserved" as JobState),
      }));
      const observedState = await observeDurableState(
        activeStores,
        mocks.s3,
        buckets,
        expectedPosts.map((post) => post.postId),
        expectedPosts.flatMap((post) => post.stagingKeys),
        [...new Set(userVectors.map((user) => user.userId))],
      );
      const consistency = evaluateConsistency(
        { posts: expectedPosts, userVectors, userVectorsUpdatedSinceMs: injectionStartedAt },
        observedState,
      );

      const burst = accounting.byOrigin.burst.total;
      const failedRequests = samples.filter((sample) => sample.status < 200 || sample.status >= 300);
      const invariants = evaluateQueueBurstInvariants({
        plannedJobs: plan.units * JOBS_PER_UNIT,
        deduplicated,
        drained,
        drainTimeoutMs: plan.drainTimeoutMs,
        accounting,
        consistency,
        phases: trafficPhases,
        samples,
      });

      const burstQueues = Object.fromEntries(BURST_QUEUES.map((queue) => [queue, WORKER_CONCURRENCY[queue]]));
      const result = {
        fixture: fixture.result,
        environment: {
          ...environment,
          queueConcurrencyPerWorkerProcess: burstQueues,
          observedWorkerConnections: workerConnections,
          leftoverJobsDrainedBeforeRun: leftoverJobs,
          mockServices: {
            openai: { endpoint: process.env.OPENAI_BASE_URL, latencyMs: MOCK_LATENCY_MS.openaiEmbeddings },
            s3: { endpoint: process.env.AWS_ENDPOINT_URL_S3, latencyMs: MOCK_LATENCY_MS.s3, bucket: buckets.bucket, stagingBucket: buckets.stagingBucket },
          },
          sourceImage: { width: image.width, height: image.height, bytes: image.bytes, sha256: image.sha256 },
        },
        unavailableMetrics: UNAVAILABLE_METRICS,
        burst: {
          units: burstPosts.length,
          stagedImages: burstPosts.reduce((n, p) => n + p.stagingKeys.length, 0),
          jobsSubmitted: submitted.length,
          deduplicatedByProducer: deduplicated,
          injectionMs: injectionEndedAt - injectionStartedAt,
          drainedWithinTimeout: drained,
          timeToZeroBacklogMs: burst.drainAfterLastSubmissionMs,
          accounting: accounting.byOrigin.burst,
        },
        backlog: { ...backlog, queueRedisPeakUsedMemoryBytes: observer.queueRedisPeakMemoryBytes() },
        trafficJobs: accounting.byOrigin.traffic,
        userTraffic: {
          postsCreated: createdPosts.length,
          phases: trafficPhases,
          failedSamples: failedRequests.slice(0, MAX_FAILED_SAMPLES),
        },
        resources: phaseObservations,
        consistency,
        mockStats: { openai: mocks.openAi.stats(), s3: mocks.s3.stats() },
        raw: {
          phases: phases.map((phase) => ({ ...phase, startedAt: new Date(phase.startMs).toISOString() })),
          depthSamples: observer.depthSamples,
          jobs: accounting.jobs,
          trafficSamples: samples,
        },
      };

      return {
        dataset: fixture.dataset,
        result,
        invariants,
        summary: renderQueueBurstSummary({
          units: burstPosts.length,
          accounting,
          backlog,
          timeToZeroBacklogMs: burst.drainAfterLastSubmissionMs,
          phases: trafficPhases,
          consistency,
          queueConcurrency: burstQueues,
          workerConnections,
        }),
      };
    },

    async describeServices() {
      const { describeDataStores } = await import("../fixture/dataStoreGuard");
      const services = await describeDataStores(stores!);
      const info = queueRedis ? await queueRedis.info("server") : "";
      return { ...services, redisQueue: /^redis_version:(.+)$/m.exec(info)?.[1].trim() ?? "unknown" };
    },

    async dispose() {
      if (stores && sessionIds.length > 0) {
        const { deleteBenchmarkSessions } = await import("../feed/sessions");
        await deleteBenchmarkSessions(stores.cacheRedis, sessionIds).catch(() => {});
      }
      sessionIds = [];
      await mocks?.openAi.close();
      await mocks?.s3.close();
      mocks = null;
      if (queuesLoaded) {
        const { closeQueues } = await import("../../queue/queues");
        await closeQueues();
      }
      queueRedis?.disconnect();
      queueRedis = null;
      await stores?.close();
      stores = null;
    },
  };
}
