// server/src/benchmark/queue/injection.ts
// Burst 注入：把每個單位平均分散在注入時間內，以 production enqueue helper 相同的 payload 送入
// 圖片、貼文向量與使用者向量工作，並記錄每個送出的 job 供帳目與一致性檢查使用。

import type { PostUploadImageJobData } from "../../queue/jobs/postImage";
import type { PostEmbeddingJobData } from "../../queue/jobs/postEmbedding";
import type { UserVectorJobData } from "../../queue/jobs/userVector";
import type { SubmittedJob } from "./accounting";
import type { BurstUnit } from "./burstPlan";

/** 已寫入 MySQL、staging 圖片已就位，等待送入 queue 的 burst 貼文 */
export interface BurstPost {
  unit: BurstUnit;
  postId: number;
  stagingKeys: string[];
  s3Keys: string[];
}

/** production enqueue helper 的形狀；user-vector 在冷卻期內回傳 null */
export interface BurstEnqueue {
  postImages(data: PostUploadImageJobData): Promise<{ id?: string }>;
  postEmbedding(data: PostEmbeddingJobData): Promise<{ id?: string }>;
  userVector(data: UserVectorJobData): Promise<{ id?: string } | null>;
}

export interface UnitJobIds {
  image?: string;
  embedding?: string;
  userVector?: string;
}

export interface BurstInjection {
  submitted: SubmittedJob[];
  jobIdsByUnit: Map<number, UnitJobIds>;
  /** producer 因冷卻期未排入的 user-vector job 數 */
  deduplicated: number;
  startedAtMs: number;
  endedAtMs: number;
}

export interface InjectBurstOptions {
  posts: readonly BurstPost[];
  injectionMs: number;
  enqueue: BurstEnqueue;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function injectBurst(options: InjectBurstOptions): Promise<BurstInjection> {
  const { posts, injectionMs, enqueue } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const submitted: SubmittedJob[] = [];
  const jobIdsByUnit = new Map<number, UnitJobIds>();
  let deduplicated = 0;

  const startedAtMs = now();
  for (const [position, post] of posts.entries()) {
    const wait = startedAtMs + (position * injectionMs) / posts.length - now();
    if (wait > 0) await sleep(wait);

    const { unit } = post;
    const imageJob = await enqueue.postImages({
      postId: post.postId,
      files: post.s3Keys.map((s3Key, i) => ({ s3Key, stagingKey: post.stagingKeys[i] })),
    });
    const embeddingJob = await enqueue.postEmbedding({
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
    const userVectorJob = await enqueue.userVector(unit.interaction);
    if (!userVectorJob) deduplicated++;

    const ids: UnitJobIds = { image: imageJob.id, embedding: embeddingJob.id, userVector: userVectorJob?.id };
    jobIdsByUnit.set(unit.index, ids);
    submitted.push({ queue: "post-image", jobId: String(ids.image), origin: "burst" });
    submitted.push({ queue: "post-embedding", jobId: String(ids.embedding), origin: "burst" });
    if (userVectorJob) submitted.push({ queue: "user-vector", jobId: String(ids.userVector), origin: "burst" });
  }

  return { submitted, jobIdsByUnit, deduplicated, startedAtMs, endedAtMs: now() };
}
