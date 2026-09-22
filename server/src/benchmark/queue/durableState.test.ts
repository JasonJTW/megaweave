import type { ConsistencyInput } from "./consistency";
import { DurableStateStores, observeDurableState } from "./durableState";

/** 與應用程式 Redis client 相同：同時等待回覆的指令達到 commandsQueueMaxLength 時拒絕新指令 */
function fakeVectorRedis(commandsQueueMaxLength: number) {
  let inFlight = 0;
  const command = async <T>(value: T): Promise<T> => {
    if (inFlight >= commandsQueueMaxLength) throw new Error("The queue is full");
    inFlight++;
    await new Promise((resolve) => setImmediate(resolve));
    inFlight--;
    return value;
  };
  return {
    hStrLen: (key: string) => command(key.startsWith("post:") ? 6144 : 0),
    hGet: () => command("5000"),
  };
}

describe("durable state observation", () => {
  it("reads Redis vectors for a full burst without exceeding the app client's command queue limit", async () => {
    const posts = Array.from({ length: 510 }, (_, i) => ({
      postId: i + 1,
      origin: "burst" as const,
      stagingKeys: [],
      embeddingJob: "completed" as const,
      imageJob: "completed" as const,
    }));
    const expected: ConsistencyInput = {
      posts,
      userVectors: posts.map((post) => ({ userId: post.postId, job: "completed" as const })),
      userVectorsUpdatedSinceMs: 0,
    };
    const stores = {
      mysql: { query: async () => [[]] },
      vectorRedis: fakeVectorRedis(100),
    } as unknown as DurableStateStores;
    const s3 = { uploads: () => new Map(), hasObject: () => false };

    const observed = await observeDurableState(stores, s3, { bucket: "b", stagingBucket: "s" }, expected);

    expect(observed.embeddings.get(510)).toEqual({ mysqlDimensions: null, redisVectorBytes: 6144 });
    expect(observed.userVectorUpdatedAtMs.get(510)).toBe(5000);
  });
});
