// server/src/benchmark/queue/consistency.ts
// Burst 結束後的持久化一致性：完成的 job 必須留下可觀測的結果（MySQL / Redis 向量、S3 物件），
// 且不得產生重複的持久化紀錄；「看似全部 completed」不足以證明沒有遺失工作。

import { EMBEDDING_DIMENSIONS } from "../fixture/embeddings";
import { isSettled, JobAccounting, JobOrigin, JobState } from "./accounting";
import type { BurstInjection, BurstPost } from "./injection";
import type { CreatedPost } from "./traffic";

const VECTOR_BYTES = EMBEDDING_DIMENSIONS * 4;
/** 失敗清單只保留前幾筆，完整數量見 expected / actual */
const MAX_LISTED = 20;

export interface ExpectedPost {
  postId: number;
  origin: JobOrigin;
  stagingKeys: readonly string[];
  embeddingJob: JobState;
  imageJob: JobState;
}

export interface ConsistencyInput {
  posts: readonly ExpectedPost[];
  userVectors: readonly { userId: number; job: JobState }[];
  /** user vector 的 updated_at 必須晚於此時間（worker 時鐘，Date.now()） */
  userVectorsUpdatedSinceMs: number;
}

export interface ObservedState {
  embeddings: ReadonlyMap<number, { mysqlDimensions: number | null; redisVectorBytes: number }>;
  /** MySQL images 資料表中每篇貼文的 s3_key */
  imageKeysByPost: ReadonlyMap<number, readonly string[]>;
  storage: {
    uploadsByKey: ReadonlyMap<string, number>;
    remainingStagingKeys: ReadonlySet<string>;
  };
  userVectorUpdatedAtMs: ReadonlyMap<number, number | null>;
}

export interface ConsistencyCheck {
  name: string;
  expected: number;
  actual: number;
  ok: boolean;
  missing: string[];
}

export interface ConsistencyResult {
  checks: ConsistencyCheck[];
  /** 同一個 key 被上傳超過一次的數量；重試時會重新上傳，屬於冪等行為 */
  duplicateUploads: number;
  /** job 終止失敗或未完成，因此不預期其結果存在的數量 */
  effectsNotExpected: Record<"post-embedding" | "post-images" | "user-vector", number>;
}

function check(name: string, expected: number, problems: string[]): ConsistencyCheck {
  return {
    name,
    expected,
    actual: expected - new Set(problems.map((problem) => problem.split(":")[0])).size,
    ok: problems.length === 0,
    missing: problems.slice(0, MAX_LISTED),
  };
}

/**
 * 依帳目決定每篇貼文與每位使用者應留下哪些結果：只有 completed 的 job 才預期有結果。
 * API 建立的貼文無法對應到個別 job，因此只有在 API 排入的工作全部完成時才預期其結果。
 */
export function expectDurableEffects(input: {
  accounting: JobAccounting;
  burstPosts: readonly BurstPost[];
  injection: Pick<BurstInjection, "jobIdsByUnit" | "startedAtMs">;
  createdPosts: readonly CreatedPost[];
}): ConsistencyInput {
  const states = new Map(input.accounting.jobs.map((job) => [`${job.queue}/${job.jobId}`, job.state]));
  const stateOf = (queue: string, jobId: string | undefined): JobState =>
    (jobId !== undefined && states.get(`${queue}/${jobId}`)) || "unobserved";
  const traffic = input.accounting.byOrigin.traffic.total;
  const trafficState: JobState = isSettled(traffic) && traffic.terminalFailed === 0 ? "completed" : "unfinished";

  return {
    posts: [
      ...input.burstPosts.map((post) => {
        const ids = input.injection.jobIdsByUnit.get(post.unit.index);
        return {
          postId: post.postId,
          origin: "burst" as const,
          stagingKeys: post.stagingKeys,
          embeddingJob: stateOf("post-embedding", ids?.embedding),
          imageJob: stateOf("post-image", ids?.image),
        };
      }),
      ...input.createdPosts.map((post) => ({
        postId: post.postId,
        origin: "traffic" as const,
        stagingKeys: post.stagingKeys,
        embeddingJob: trafficState,
        imageJob: trafficState,
      })),
    ],
    userVectors: input.burstPosts.map((post) => ({
      userId: post.unit.interaction.userId,
      job: stateOf("user-vector", input.injection.jobIdsByUnit.get(post.unit.index)?.userVector),
    })),
    userVectorsUpdatedSinceMs: input.injection.startedAtMs,
  };
}

export function evaluateConsistency(input: ConsistencyInput, observed: ObservedState): ConsistencyResult {
  const embeddingPosts = input.posts.filter((post) => post.embeddingJob === "completed");
  const imagePosts = input.posts.filter((post) => post.imageJob === "completed" && post.stagingKeys.length > 0);
  const vectorUsers = input.userVectors.filter((user) => user.job === "completed");

  const embeddingProblems = embeddingPosts
    .filter((post) => {
      const embedding = observed.embeddings.get(post.postId);
      return embedding?.mysqlDimensions !== EMBEDDING_DIMENSIONS || embedding.redisVectorBytes !== VECTOR_BYTES;
    })
    .map((post) => `post ${post.postId}`);

  const imageProblems = imagePosts.flatMap((post) => {
    const keys = observed.imageKeysByPost.get(post.postId) ?? [];
    return [
      ...keys
        .filter((key) => (observed.storage.uploadsByKey.get(key) ?? 0) === 0)
        .map((key) => `post ${post.postId}: ${key} not uploaded`),
      ...post.stagingKeys
        .filter((key) => observed.storage.remainingStagingKeys.has(key))
        .map((key) => `post ${post.postId}: ${key} not deleted`),
    ];
  });

  const duplicateRowProblems = input.posts
    .filter((post) => (observed.imageKeysByPost.get(post.postId)?.length ?? 0) !== post.stagingKeys.length)
    .map(
      (post) =>
        `post ${post.postId}: ${observed.imageKeysByPost.get(post.postId)?.length ?? 0} image rows for ${post.stagingKeys.length} uploads`,
    );

  const vectorProblems = vectorUsers
    .filter((user) => (observed.userVectorUpdatedAtMs.get(user.userId) ?? 0) < input.userVectorsUpdatedSinceMs)
    .map((user) => `user ${user.userId}`);

  const imageKeys = input.posts.flatMap((post) => observed.imageKeysByPost.get(post.postId) ?? []);
  return {
    checks: [
      check("embeddings-persisted", embeddingPosts.length, embeddingProblems),
      check("images-processed", imagePosts.length, imageProblems),
      check("no-duplicate-image-rows", input.posts.length, duplicateRowProblems),
      check("user-vectors-updated", vectorUsers.length, vectorProblems),
    ],
    duplicateUploads: imageKeys.filter((key) => (observed.storage.uploadsByKey.get(key) ?? 0) > 1).length,
    effectsNotExpected: {
      "post-embedding": input.posts.length - embeddingPosts.length,
      "post-images": input.posts.filter((post) => post.stagingKeys.length > 0).length - imagePosts.length,
      "user-vector": input.userVectors.length - vectorUsers.length,
    },
  };
}
