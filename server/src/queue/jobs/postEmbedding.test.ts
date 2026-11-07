import { processPostEmbedding, PostEmbeddingJobData } from "./postEmbedding";
import { getRedisClient, getVectorRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import OpenAI from "openai";
import { Job } from "bullmq";

jest.mock("../../utils/redis");
jest.mock("../../utils/db");
jest.mock("openai");

interface MockRedisClient {
  hSet: jest.Mock;
}

describe("postEmbedding worker", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";
    mockRedis = {
      hSet: jest.fn().mockResolvedValue("OK"),
    };
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (getVectorRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  it("fetches embedding from OpenAI and writes FLOAT32 buffer to Redis and JSON to MySQL", async () => {
    // Mock categories & conditions DB queries
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([
        [
          { id: 1, name: "書籍", name_en: "Books" },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { level: 1, name: "Brand New" },
        ],
      ]);

    // Mock OpenAI embedding API
    const dummyEmbedding = new Array(1536).fill(0.05);
    (OpenAI.prototype.embeddings = {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: dummyEmbedding }],
      }),
    } as unknown as OpenAI.Embeddings);

    (dbPool.execute as jest.Mock).mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT org_id, audience_tier FROM posts")
        ? [[{ org_id: 7, audience_tier: "members" }]]
        : [{}],
    );

    const mockJob = {
      data: {
        postId: 101,
        post: {
          title: "Introduction to Algorithms",
          content: "Classic CLRS computer science textbook.",
          type: "share",
          categoryId: 1,
          conditionLevel: 1,
          city: "Taipei",
          province: "Taiwan",
        },
      } as PostEmbeddingJobData,
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<PostEmbeddingJobData>;

    await processPostEmbedding(mockJob);

    // Verify Redis HSET
    expect(mockRedis.hSet).toHaveBeenCalledTimes(1);
    const [redisKey, payload] = mockRedis.hSet.mock.calls[0];
    expect(redisKey).toBe("post:101");
    expect(payload.post_id).toBe(101);
    expect(payload.status).toBe("share");
    //* scope 依 MySQL 當下的層級（ADR 0003），不是排入佇列時的快照
    expect(payload.scope).toBe("org:7:members");
    expect(Buffer.isBuffer(payload.v)).toBe(true);
    expect(payload.v.length).toBe(1536 * 4);

    // Verify MySQL UPDATE
    const updates = (dbPool.execute as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).startsWith("UPDATE posts"),
    );
    expect(updates).toHaveLength(1);
    const [sql, params] = updates[0];
    expect(sql).toContain("UPDATE posts SET embedding = ? WHERE id = ?");
    expect(params[1]).toBe(101);
    const savedArr = JSON.parse(params[0]);
    expect(savedArr).toHaveLength(1536);
    expect(savedArr[0]).toBeCloseTo(0.05, 4);
  });
});
