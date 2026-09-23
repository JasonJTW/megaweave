// server/src/benchmark/queue/traffic.ts
// Queue burst 期間持續進行的低量使用者流量：feed 瀏覽沿用 feed profile 的瀏覽器式 workload，
// 貼文建立走與 client 相同的流程（presigned URL → 上傳 staging 原圖 → 建立貼文），全部經由公開 HTTP API。
// 流量是 closed loop：每個虛擬使用者收到回應並等待 think time 後才發出下一個請求，直到收到停止訊號。

import { buildFeedUrl, REQUEST_TIMEOUT_MS } from "../feed/load";
import { isSuccess, round } from "../feed/stats";
import { createVirtualUserScript, FeedPersona, WorkloadCatalog } from "../feed/workload";
import { createRandom, deriveSeed, Random } from "../fixture/random";
import { generatePostDraft } from "./burstPlan";
import type { TrafficGroup, TrafficSample } from "./phases";

export const PRESIGNED_URLS_PATH = "/api/posts/presigned-urls";
export const CREATE_POST_PATH = "/api/posts";
/** 與 client 預設相同：新貼文 30 天後到期 */
const POST_EXPIRY_DAYS = 30;

export interface PostLocation {
  place_id: string;
  full_address: string;
  province: string;
  city: string;
  lat: number;
  lng: number;
}

export interface CreatedPost {
  postId: number;
  stagingKeys: string[];
}

export interface TrafficOptions {
  targetUrl: string;
  sessionCookieName: string;
  catalog: WorkloadCatalog;
  feedUsers: readonly { persona: FeedPersona; seed: number }[];
  posters: readonly { sessionId: string; seed: number; location?: PostLocation }[];
  feedThinkTimeMs: { min: number; max: number };
  postThinkTimeMs: { min: number; max: number };
  /** 每篇新貼文附帶的圖片數與權重 */
  imageCountWeights: readonly (readonly [number, number])[];
  /** 上傳到 presigned URL 的原圖 */
  image: Buffer;
  signal: AbortSignal;
}

export interface TrafficResult {
  samples: TrafficSample[];
  createdPosts: CreatedPost[];
}

/** 可被停止訊號中斷的等待，讓流量在停止後立即結束而不必等完整個 think time */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

interface Timed<T> {
  sample: TrafficSample;
  body: T | null;
}

async function timedRequest<T>(
  group: TrafficGroup,
  requestClass: string,
  url: string,
  init: RequestInit,
  samples: TrafficSample[],
): Promise<Timed<T>> {
  const startedAtMs = Date.now();
  const started = performance.now();
  let sample: TrafficSample;
  let body: T | null = null;
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const bytes = await response.arrayBuffer();
    sample = {
      group,
      requestClass,
      startedAtMs,
      latencyMs: round(performance.now() - started),
      status: response.status,
      bytes: bytes.byteLength,
    };
    if (response.ok && bytes.byteLength > 0 && response.headers.get("content-type")?.includes("json")) {
      body = JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
    }
  } catch (error) {
    sample = {
      group,
      requestClass,
      startedAtMs,
      latencyMs: round(performance.now() - started),
      status: 0,
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  samples.push(sample);
  return { sample, body };
}

async function createPost(
  options: TrafficOptions,
  poster: TrafficOptions["posters"][number],
  random: Random,
  samples: TrafficSample[],
): Promise<CreatedPost | null> {
  const cookie = `${options.sessionCookieName}=${poster.sessionId}`;
  const imageCount = random.weighted(options.imageCountWeights);
  const presign = await timedRequest<{ urls: { stagingKey: string; presignedUrl: string }[] }>(
    "post-creation",
    "post-presign",
    new URL(PRESIGNED_URLS_PATH, options.targetUrl).toString(),
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        files: Array.from({ length: imageCount }, (_, i) => ({ filename: `photo-${i + 1}.jpg`, contentType: "image/jpeg" })),
      }),
    },
    samples,
  );
  if (!isSuccess(presign.sample) || !presign.body) return null;

  // 上傳到 staging 是瀏覽器直接對 S3 的請求，不屬於 API 延遲；只有失敗時才記錄
  const stagingKeys: string[] = [];
  for (const { stagingKey, presignedUrl } of presign.body.urls) {
    const uploadSamples: TrafficSample[] = [];
    const upload = await timedRequest(
      "post-creation",
      "staging-upload",
      presignedUrl,
      { method: "PUT", headers: { "content-type": "image/jpeg" }, body: options.image },
      uploadSamples,
    );
    if (!isSuccess(upload.sample)) {
      samples.push(upload.sample);
      return null;
    }
    stagingKeys.push(stagingKey);
  }

  const draft = generatePostDraft(random);
  const create = await timedRequest<{ post: { id: number } }>(
    "post-creation",
    "post-create",
    new URL(CREATE_POST_PATH, options.targetUrl).toString(),
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        title: draft.title,
        content: draft.content,
        type: draft.type,
        categoryId: draft.categoryId,
        conditionLevel: draft.conditionLevel,
        ...(draft.tags ? { tags: draft.tags } : {}),
        items: draft.items,
        expiresAt: new Date(Date.now() + POST_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        ...(poster.location ?? {}),
        stagingKeys,
      }),
    },
    samples,
  );
  const postId = create.body?.post?.id;
  return isSuccess(create.sample) && typeof postId === "number" ? { postId, stagingKeys } : null;
}

export async function runTraffic(options: TrafficOptions): Promise<TrafficResult> {
  const samples: TrafficSample[] = [];
  const createdPosts: CreatedPost[] = [];
  const { signal } = options;
  const thinkTime = (random: Random, range: { min: number; max: number }) =>
    range.min + random.next() * (range.max - range.min);

  const loop = async (random: Random, range: { min: number; max: number }, act: () => Promise<void>) => {
    // 錯開啟動時間，避免所有使用者在同一瞬間送出第一個請求
    await pause(random.next() * range.min, signal);
    while (!signal.aborted) {
      await act();
      await pause(thinkTime(random, range), signal);
    }
  };

  const feedLoops = options.feedUsers.map(({ persona, seed }) => {
    const nextRequest = createVirtualUserScript(persona, options.catalog, createRandom(deriveSeed(seed, "requests")));
    return loop(createRandom(deriveSeed(seed, "think-time")), options.feedThinkTimeMs, async () => {
      const request = nextRequest();
      await timedRequest(
        "feed",
        request.requestClass,
        buildFeedUrl(options.targetUrl, request),
        { headers: request.sessionId ? { cookie: `${options.sessionCookieName}=${request.sessionId}` } : {} },
        samples,
      );
    });
  });

  const postLoops = options.posters.map((poster) => {
    const contentRandom = createRandom(deriveSeed(poster.seed, "posts"));
    return loop(createRandom(deriveSeed(poster.seed, "think-time")), options.postThinkTimeMs, async () => {
      const created = await createPost(options, poster, contentRandom, samples);
      if (created) createdPosts.push(created);
    });
  });

  await Promise.all([...feedLoops, ...postLoops]);
  return { samples, createdPosts };
}
