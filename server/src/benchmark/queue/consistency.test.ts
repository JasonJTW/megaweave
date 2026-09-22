import { accountJobs, JobEvent, SubmittedJob } from "./accounting";
import type { BurstUnit } from "./burstPlan";
import { evaluateConsistency, expectDurableEffects, ConsistencyInput, ObservedState } from "./consistency";
import type { BurstPost } from "./injection";

const VECTOR_BYTES = 1536 * 4;

function observed(overrides: Partial<ObservedState> = {}): ObservedState {
  return {
    embeddings: new Map([
      [1, { mysqlDimensions: 1536, redisVectorBytes: VECTOR_BYTES }],
      [2, { mysqlDimensions: 1536, redisVectorBytes: VECTOR_BYTES }],
    ]),
    imageKeysByPost: new Map([
      [1, ["posts/1-a.webp", "posts/1-b.webp"]],
      [2, ["posts/2-a.webp"]],
    ]),
    storage: {
      uploadsByKey: new Map([
        ["posts/1-a.webp", 1],
        ["posts/1-b.webp", 1],
        ["posts/2-a.webp", 1],
      ]),
      remainingStagingKeys: new Set<string>(),
    },
    userVectorUpdatedAtMs: new Map([[7, 5_000]]),
    ...overrides,
  };
}

const input: ConsistencyInput = {
  posts: [
    { postId: 1, origin: "burst", stagingKeys: ["staging/1-a.jpg", "staging/1-b.jpg"], embeddingJob: "completed", imageJob: "completed" },
    { postId: 2, origin: "traffic", stagingKeys: ["staging/2-a.jpg"], embeddingJob: "completed", imageJob: "completed" },
  ],
  userVectors: [{ userId: 7, job: "completed" }],
  userVectorsUpdatedSinceMs: 1_000,
};

const byName = (checks: ReturnType<typeof evaluateConsistency>["checks"]) =>
  Object.fromEntries(checks.map((check) => [check.name, check]));

describe("queue burst post-run consistency", () => {
  it("passes when every completed job left its durable effect exactly once", () => {
    const result = evaluateConsistency(input, observed());

    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(result.duplicateUploads).toBe(0);
  });

  it("reports completed embedding jobs whose vector is missing from MySQL or Redis", () => {
    const result = evaluateConsistency(
      input,
      observed({
        embeddings: new Map([
          [1, { mysqlDimensions: null, redisVectorBytes: VECTOR_BYTES }],
          [2, { mysqlDimensions: 1536, redisVectorBytes: 0 }],
        ]),
      }),
    );

    expect(byName(result.checks)["embeddings-persisted"]).toMatchObject({ ok: false, expected: 2, actual: 0, missing: ["post 1", "post 2"] });
  });

  it("reports completed image jobs whose uploads are missing or whose staging objects remain", () => {
    const result = evaluateConsistency(
      input,
      observed({
        storage: {
          uploadsByKey: new Map([["posts/1-a.webp", 1], ["posts/2-a.webp", 1]]),
          remainingStagingKeys: new Set(["staging/2-a.jpg"]),
        },
      }),
    );

    const check = byName(result.checks)["images-processed"];
    expect(check).toMatchObject({ ok: false, expected: 2, actual: 0 });
    expect(check.missing).toEqual(["post 1: posts/1-b.webp not uploaded", "post 2: staging/2-a.jpg not deleted"]);
  });

  it("detects duplicate image rows as duplicate durable records", () => {
    const result = evaluateConsistency(
      input,
      observed({
        imageKeysByPost: new Map([
          [1, ["posts/1-a.webp", "posts/1-b.webp", "posts/1-c.webp"]],
          [2, ["posts/2-a.webp"]],
        ]),
      }),
    );

    expect(byName(result.checks)["no-duplicate-image-rows"]).toMatchObject({ ok: false, missing: ["post 1: 3 image rows for 2 uploads"] });
  });

  it("counts repeated uploads of the same key without failing, because retries re-upload idempotently", () => {
    const result = evaluateConsistency(
      input,
      observed({
        storage: {
          uploadsByKey: new Map([["posts/1-a.webp", 2], ["posts/1-b.webp", 1], ["posts/2-a.webp", 1]]),
          remainingStagingKeys: new Set<string>(),
        },
      }),
    );

    expect(result.duplicateUploads).toBe(1);
    expect(byName(result.checks)["images-processed"].ok).toBe(true);
  });

  it("requires user vectors to be rewritten after the burst started", () => {
    const result = evaluateConsistency(input, observed({ userVectorUpdatedAtMs: new Map([[7, 500]]) }));

    expect(byName(result.checks)["user-vectors-updated"]).toMatchObject({ ok: false, missing: ["user 7"] });
  });

  it("does not expect effects from jobs that terminally failed, but reports them", () => {
    const result = evaluateConsistency(
      {
        ...input,
        posts: [{ ...input.posts[0], embeddingJob: "failed" }, input.posts[1]],
      },
      observed({ embeddings: new Map([[2, { mysqlDimensions: 1536, redisVectorBytes: VECTOR_BYTES }]]) }),
    );

    expect(byName(result.checks)["embeddings-persisted"]).toMatchObject({ ok: true, expected: 1, actual: 1 });
    expect(result.effectsNotExpected).toEqual({ "post-embedding": 1, "post-images": 0, "user-vector": 0 });
  });
});

describe("expected durable effects", () => {
  const burstPost = (index: number, userId: number): BurstPost => ({
    unit: { index, interaction: { userId, postId: 900, action: "view" } } as BurstUnit,
    postId: 100 + index,
    stagingKeys: [`staging/${index}.jpg`],
    s3Keys: [`posts/${index}.webp`],
  });
  const lifecycle = (queue: string, jobId: string, end: "completed" | "failed" | null): JobEvent[] => [
    { queue, jobId, type: "added", atMs: 0 },
    { queue, jobId, type: "active", atMs: 1 },
    ...(end ? [{ queue, jobId, type: end, atMs: 2 } as JobEvent] : []),
  ];
  const injection = {
    startedAtMs: 1_234,
    jobIdsByUnit: new Map([
      [0, { image: "1", embedding: "1", userVector: "1" }],
      [1, { image: "2", embedding: "2", userVector: undefined }],
    ]),
  };
  const submitted: SubmittedJob[] = [
    { queue: "post-image", jobId: "1", origin: "burst" },
    { queue: "post-embedding", jobId: "1", origin: "burst" },
    { queue: "user-vector", jobId: "1", origin: "burst" },
    { queue: "post-image", jobId: "2", origin: "burst" },
    { queue: "post-embedding", jobId: "2", origin: "burst" },
  ];

  it("expects each burst post's effects according to its own jobs, and user vectors updated since the burst started", () => {
    const accounting = accountJobs({
      submitted,
      events: [
        ...lifecycle("post-image", "1", "completed"),
        ...lifecycle("post-embedding", "1", "completed"),
        ...lifecycle("user-vector", "1", "completed"),
        ...lifecycle("post-image", "2", "failed"),
      ],
    });

    const expected = expectDurableEffects({
      accounting,
      burstPosts: [burstPost(0, 7), burstPost(1, 8)],
      injection,
      createdPosts: [],
    });

    expect(expected).toEqual({
      posts: [
        { postId: 100, origin: "burst", stagingKeys: ["staging/0.jpg"], embeddingJob: "completed", imageJob: "completed" },
        { postId: 101, origin: "burst", stagingKeys: ["staging/1.jpg"], embeddingJob: "unobserved", imageJob: "failed" },
      ],
      userVectors: [
        { userId: 7, job: "completed" },
        { userId: 8, job: "unobserved" },
      ],
      userVectorsUpdatedSinceMs: 1_234,
    });
  });

  it("expects posts created by the traffic only when every job the API enqueued completed", () => {
    const events = [
      ...lifecycle("post-image", "1", "completed"),
      ...lifecycle("post-embedding", "1", "completed"),
      ...lifecycle("user-vector", "1", "completed"),
      ...lifecycle("post-image", "2", "completed"),
      ...lifecycle("post-embedding", "2", "completed"),
    ];
    const createdPosts = [{ postId: 300, stagingKeys: ["staging/api.jpg"] }];
    const expectFor = (apiJobEnd: "completed" | "failed" | null) =>
      expectDurableEffects({
        accounting: accountJobs({ submitted, events: [...events, ...lifecycle("post-image", "api-1", apiJobEnd)] }),
        burstPosts: [burstPost(0, 7), burstPost(1, 8)],
        injection,
        createdPosts,
      }).posts.find((post) => post.origin === "traffic");

    expect(expectFor("completed")).toEqual({
      postId: 300,
      origin: "traffic",
      stagingKeys: ["staging/api.jpg"],
      embeddingJob: "completed",
      imageJob: "completed",
    });
    expect(expectFor("failed")?.imageJob).toBe("unfinished");
    expect(expectFor(null)?.embeddingJob).toBe("unfinished");
  });
});
