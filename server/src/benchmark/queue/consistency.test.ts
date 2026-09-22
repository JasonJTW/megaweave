import { evaluateConsistency, ConsistencyInput, ObservedState } from "./consistency";

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
