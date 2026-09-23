// server/src/benchmark/queue/queueBurstProfile.ts
// queue-burst-* profile：在低量且持續的 feed 與貼文建立流量下，送入代表性的圖片、貼文向量與使用者向量工作，
// 量測非同步處理能力（等待 / 處理時間、重試、峰值深度、清空 backlog 時間）與使用者端延遲的變化，
// 最後以持久化結果驗證沒有遺失或重複的工作。OpenAI 與 S3 由 runner 啟動的 loopback mock 取代。

import { randomUUID } from "crypto";
import type Redis from "ioredis";
import { BenchmarkSafetyError } from "../errors";
import type { BenchmarkProfile, BenchmarkProfileOutcome } from "../profiles";
import type { AppStores } from "../fixture/fixtureProfile";
import { EMBEDDING_MODEL_VERSION } from "../fixture/embeddings";
import { DEFAULT_FIXTURE_SEED } from "../fixture/generateFixture";
import { deriveSeed } from "../fixture/random";
import { BURST_IMAGE_COUNT_WEIGHTS, INTERACTION_MIX } from "./burstPlan";
import type { MockOpenAi } from "../mocks/mockOpenAi";
import type { MockS3 } from "../mocks/mockS3";
import { isSettled } from "./accounting";
import { MockEndpoints, resolveMockEndpoints } from "./mockEnvironment";
import type { TrafficPhase } from "./phases";
import { CREATE_POST_PATH, PRESIGNED_URLS_PATH } from "./traffic";
import type { SourceImageVariant } from "./imageMix";
import { FEED_PATH } from "../feed/load";
import { isSuccess } from "../feed/stats";
import { MAX_SCROLL_PAGES, SCROLL_PROBABILITY, VIEW_MIX } from "../feed/workload";

export const BURST_QUEUES = ["post-image", "post-embedding", "user-vector"] as const;
const JOBS_PER_UNIT = BURST_QUEUES.length;
const BENCHMARK_QUEUE_MARKER_KEY = "benchmark:environment";
const TRAFFIC_JOBS_TIMEOUT_MS = 120_000;
const MAX_FAILED_SAMPLES = 50;

const MOCK_LATENCY_MS = {
  openaiEmbeddings: { min: 150, max: 450 },
  s3: { min: 20, max: 80 },
};

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
  /** burst 與發文流量上傳的原圖組成 */
  imageMix: readonly SourceImageVariant[];
  seed?: number;
}

export function createQueueBurstProfile(options: QueueBurstProfileOptions): BenchmarkProfile {
  const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
  const fixtureOptions = { posts: options.posts, seed };
  const { plan, imageMix } = options;
  const totalImageWeight = imageMix.reduce((sum, variant) => sum + variant.weight, 0);
  const describedImageMix = imageMix.map(({ weight, ...variant }) => ({
    ...variant,
    share: Math.round((weight / totalImageWeight) * 1000) / 1000,
  }));
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
        sourceImages: {
          mix: describedImageMix,
          assignment: "each staged image draws a variant independently by share, from a seeded sequence",
          content: "synthetic gradient with noise; no real photos",
        },
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
          sourceImages: "same mix as the burst, drawn per image",
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
      const { assignImageVariants, countVariants } = await import("./imageMix");
      const { createPosterSessions, insertBurstPosts, loadBurstCandidates } = await import("./setup");
      const { drainQueues, requireWorkers, waitForIdleQueues } = await import("./queueControl");
      const { startQueueObserver, waitFor } = await import("./observer");
      const { injectBurst } = await import("./injection");
      const { runTraffic } = await import("./traffic");
      const { accountJobs } = await import("./accounting");
      const { summarizeBacklog } = await import("./backlog");
      const { summarizeTrafficPhases } = await import("./phases");
      const { evaluateConsistency, expectDurableEffects } = await import("./consistency");
      const { observeDurableState } = await import("./durableState");
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

      // 1. 準備：確認 worker、清掉殘留工作（在 fixture 重新載入前，避免 worker 以舊的貼文 ID 處理），再寫入 burst 貼文
      const workerConnections = await requireWorkers(queues);
      const leftoverJobs = await drainQueues(queues);
      await waitForIdleQueues(queues);
      const fixture = await prepareFixture(activeStores, fixtureOptions);
      // fixture 重新載入後，API 記憶體中的向量快取已過期
      await resetTargetCaches(target);

      const images = new Map<string, Awaited<ReturnType<typeof createSampleImage>>>();
      for (const variant of imageMix) {
        images.set(
          variant.name,
          await createSampleImage({ ...variant, seed: deriveSeed(seed, "queue-burst-image", variant.name) }),
        );
      }
      const units = generateBurstPlan({ seed, units: plan.units, candidates: await loadBurstCandidates(activeStores.mysql) });
      // 每次執行的 S3 key 不同，mock S3 的上傳計數不會與先前執行混淆
      const burstPosts = await insertBurstPosts(activeStores.mysql, units, randomUUID().slice(0, 8));
      const stagingKeys = burstPosts.flatMap((post) => post.stagingKeys);
      const variants = assignImageVariants({ seed: deriveSeed(seed, "queue-burst"), count: stagingKeys.length, mix: imageMix });
      stagingKeys.forEach((key, i) => mocks!.s3.putObject(buckets.stagingBucket, key, images.get(variants[i].name)!.buffer));
      const stagedImages = stagingKeys.length;
      const stagedImagesByVariant = countVariants(variants);
      log(`prepared ${burstPosts.length} burst posts with ${stagedImages} staged images ${JSON.stringify(stagedImagesByVariant)}`);

      const personas = await preparePersonas(activeStores, plan.feedVirtualUsers);
      const posters = await createPosterSessions(activeStores, plan.postVirtualUsers);
      sessionIds = [...personas.sessionIds, ...posters.map((poster) => poster.sessionId)];
      const environment = await describeEnvironment(activeStores);

      // 2. 量測：使用者流量全程進行，依序量測 burst 前、burst 直到工作全部終止、burst 後三個階段
      const observer = await startQueueObserver(queues, redis, plan.depthSampleIntervalMs);
      const stopTraffic = new AbortController();
      const traffic = runTraffic({
        targetUrl: target,
        sessionCookieName: sessionCookieName(),
        catalog: personas.catalog,
        feedUsers: personas.personas.map((persona, index) => ({ persona, seed: deriveSeed(seed, "queue-burst-feed", index) })),
        posters: posters.map((poster, index) => ({ ...poster, seed: deriveSeed(seed, "queue-burst-poster", index) })),
        feedThinkTimeMs: plan.feedThinkTimeMs,
        postThinkTimeMs: plan.postThinkTimeMs,
        imageCountWeights: BURST_IMAGE_COUNT_WEIGHTS,
        images: imageMix.map((variant) => [
          {
            buffer: images.get(variant.name)!.buffer,
            contentType: `image/${variant.format}`,
            extension: variant.format === "jpeg" ? "jpg" : "webp",
          },
          variant.weight,
        ] as const),
        signal: stopTraffic.signal,
      });

      const snapshot = () => takeSnapshot({ ...activeStores, targetUrl: target });
      const phases: TrafficPhase[] = [];
      const phaseObservations: Record<string, ReturnType<typeof diffSnapshots>> = {};
      const measurePhase = async <T>(name: string, until: () => Promise<T>): Promise<T> => {
        const sampler = startApiMemorySampler(target);
        const start = await snapshot();
        const startMs = Date.now();
        const value = await until();
        const endMs = Date.now();
        const end = await snapshot();
        phases.push({ name, startMs, endMs });
        phaseObservations[name] = diffSnapshots(start, end, sampler.stop());
        log(`${name} phase: ${Math.round((endMs - startMs) / 1000)}s`);
        return value;
      };
      const pauseFor = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

      const measureAllPhases = async () => {
        await measurePhase("before", pauseFor(plan.baselineMs));
        const burstOutcome = await measurePhase("burst", async () => {
          const injected = await injectBurst({
            posts: burstPosts,
            injectionMs: plan.injectionMs,
            enqueue: {
              postImages: queueModule.enqueuePostUploadImages,
              postEmbedding: queueModule.enqueuePostEmbedding,
              userVector: queueModule.enqueueUserVectorUpdate,
            },
          });
          log(`enqueued ${injected.submitted.length} burst jobs in ${Math.round((injected.endedAtMs - injected.startedAtMs) / 1000)}s; waiting for the backlog to clear`);
          const settled = await waitFor(
            () => isSettled(accountJobs({ submitted: injected.submitted, events: observer.events }).byOrigin.burst.total),
            plan.drainTimeoutMs,
            200,
          );
          return { injection: injected, drained: settled };
        });
        await measurePhase("after", pauseFor(plan.recoveryMs));
        return burstOutcome;
      };
      const { injection, drained } = await measureAllPhases().finally(() => stopTraffic.abort());
      const { samples, createdPosts } = await traffic;
      const { submitted, deduplicated, startedAtMs, endedAtMs } = injection;

      // 等待使用者流量排入的工作也完成，才能檢查其持久化結果
      await waitFor(
        () => isSettled(accountJobs({ submitted, events: observer.events }).byOrigin.traffic.total),
        TRAFFIC_JOBS_TIMEOUT_MS,
        250,
      );
      await observer.stop();

      // 3. 結果：帳目、backlog、各階段流量、持久化一致性與通過條件
      const accounting = accountJobs({ submitted, events: observer.events });
      const backlog = summarizeBacklog(observer.depthSamples, { injectionStartedAtMs: startedAtMs, injectionEndedAtMs: endedAtMs });
      const trafficPhases = summarizeTrafficPhases(samples, phases);
      const expected = expectDurableEffects({ accounting, burstPosts, injection, createdPosts });
      const consistency = evaluateConsistency(expected, await observeDurableState(activeStores, mocks.s3, buckets, expected));
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

      const burst = accounting.byOrigin.burst.total;
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
          sourceImages: Object.fromEntries(
            [...images].map(([name, image]) => [
              name,
              { format: image.format, width: image.width, height: image.height, bytes: image.bytes, sha256: image.sha256 },
            ]),
          ),
        },
        unavailableMetrics: UNAVAILABLE_METRICS,
        burst: {
          units: burstPosts.length,
          stagedImages,
          stagedImagesByVariant,
          jobsSubmitted: submitted.length,
          deduplicatedByProducer: deduplicated,
          injectionMs: endedAtMs - startedAtMs,
          drainedWithinTimeout: drained,
          timeToZeroBacklogMs: burst.drainAfterLastSubmissionMs,
          accounting: accounting.byOrigin.burst,
        },
        backlog: { ...backlog, queueRedisPeakUsedMemoryBytes: observer.queueRedisPeakMemoryBytes() },
        trafficJobs: accounting.byOrigin.traffic,
        userTraffic: {
          postsCreated: createdPosts.length,
          phases: trafficPhases,
          failedSamples: samples.filter((sample) => !isSuccess(sample)).slice(0, MAX_FAILED_SAMPLES),
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
          stagedImagesByVariant,
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
