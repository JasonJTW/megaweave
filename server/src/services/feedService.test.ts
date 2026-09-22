import {
  FeedService,
  feedService,
  clearVectorMemoryCachesForTest,
  getCandidateVectorReadStats,
} from "./feedService";
import { getRedisClient, getCacheRedisClient, getVectorRedisClient } from "../utils/redis";
import dbPool from "../utils/db";
import { fetchQueryEmbedding } from "./embeddingService";

jest.mock("../utils/redis");
jest.mock("../utils/db");
jest.mock("./embeddingService");

interface MockRedisClient {
  sendCommand: jest.Mock;
  zCard: jest.Mock;
  zRange: jest.Mock;
}

describe("FeedService", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    clearVectorMemoryCachesForTest();
    mockRedis = {
      sendCommand: jest.fn().mockResolvedValue(null),
      zCard: jest.fn().mockResolvedValue(0),
      zRange: jest.fn().mockResolvedValue([]),
    };
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (getCacheRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (getVectorRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  function createFloat32Buffer(vec: number[]): Buffer {
    const buf = Buffer.alloc(vec.length * 4);
    for (let i = 0; i < vec.length; i++) {
      buf.writeFloatLE(vec[i], i * 4);
    }
    return buf;
  }

  describe("getFeed Routing", () => {
    it("routes to filtered feed when filter parameters (category, type, etc.) are present", async () => {
      const getFilteredFeedSpy = jest
        .spyOn(feedService, "getFilteredFeed")
        .mockResolvedValue({
          posts: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalPosts: 0,
            postsPerPage: 20,
          },
          isPersonalized: false,
        });

      await feedService.getFeed({ category_id: 3 });

      expect(getFilteredFeedSpy).toHaveBeenCalledTimes(1);
    });

    it("routes a search query to semantic vector search", async () => {
      const semanticSearchSpy = jest
        .spyOn(feedService, "getSemanticSearchFeed")
        .mockResolvedValue({
          posts: [],
          pagination: { currentPage: 1, totalPages: 1, totalPosts: 0, postsPerPage: 20 },
          isPersonalized: false,
        });

      await feedService.getFeed({ search: "露營燈" });

      expect(semanticSearchSpy).toHaveBeenCalledWith({ search: "露營燈" });
    });

    it("embeds the search query, uses Redis KNN, then applies active-post filters in MySQL", async () => {
      const service = new FeedService();
      const queryVector = createFloat32Buffer(new Array(1536).fill(0.1));
      (fetchQueryEmbedding as jest.Mock).mockResolvedValue(queryVector);
      mockRedis.sendCommand.mockResolvedValue([
        2,
        "post:2",
        ["vector_distance", "0.02"],
        "post:1",
        ["vector_distance", "0.20"],
      ]);
      const matchingRows = [
        { id: 1, hot_score: 1, expires_at: null, lat: null, lng: null },
        // 即使已過期，語意搜尋也不應因期限而失去其較高的相似度排序。
        { id: 2, hot_score: 1, expires_at: "2020-01-01T00:00:00.000Z", lat: null, lng: null },
      ];
      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([matchingRows])
        .mockResolvedValueOnce([matchingRows]);

      const result = await service.getSemanticSearchFeed({
        search: "適合露營照明的燈",
        limit: 20,
      });

      expect(fetchQueryEmbedding).toHaveBeenCalledWith("適合露營照明的燈");
      expect(mockRedis.sendCommand).toHaveBeenCalledWith(
        expect.arrayContaining(["FT.SEARCH", "idx:posts_v", queryVector]),
      );
      expect((dbPool.execute as jest.Mock).mock.calls[0][0]).toContain(
        "p.status = 'active'",
      );
      expect(result.posts.map((post) => post.id)).toEqual([2, 1]);
    });

    it("routes to personalized feed when user has a vector and no filters are present", async () => {
      // Mock 1536 dimension vector buffer
      const dummyVec = new Array(1536).fill(0.1);
      const vecBuf = createFloat32Buffer(dummyVec);

      jest.spyOn(feedService, "getUserVector").mockResolvedValue(vecBuf);
      const getPersonalizedFeedSpy = jest
        .spyOn(feedService, "getPersonalizedFeed")
        .mockResolvedValue({
          posts: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalPosts: 0,
            postsPerPage: 20,
          },
          isPersonalized: true,
        });

      await feedService.getFeed({ userId: 10 });

      expect(getPersonalizedFeedSpy).toHaveBeenCalledTimes(1);
    });

    it("routes to trending feed for cold start (new/guest user without vector and no coords)", async () => {
      jest.spyOn(feedService, "getUserVector").mockResolvedValue(null);
      const getTrendingFeedSpy = jest
        .spyOn(feedService, "getTrendingFeed")
        .mockResolvedValue({
          posts: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalPosts: 0,
            postsPerPage: 20,
          },
          isPersonalized: false,
        });

      await feedService.getFeed({});

      expect(getTrendingFeedSpy).toHaveBeenCalledTimes(1);
    });

    it("routes to filtered feed for guest user with lat/lng coordinates (Geo Boost)", async () => {
      jest.spyOn(feedService, "getUserVector").mockResolvedValue(null);
      const getFilteredFeedSpy = jest
        .spyOn(feedService, "getFilteredFeed")
        .mockResolvedValue({
          posts: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalPosts: 0,
            postsPerPage: 20,
          },
          isPersonalized: false,
        });

      await feedService.getFeed({ lat: 25.033, lng: 121.565 });

      expect(getFilteredFeedSpy).toHaveBeenCalledWith(
        { lat: 25.033, lng: 121.565 },
        null,
      );
    });
  });

  describe("getFilteredFeed Hybrid Scoring", () => {
    it("correctly ranks posts matching user interest vector higher", async () => {
      const service = new FeedService();

      const candidatePosts = [
        // Post 1: Orthogonal to user vector
        {
          id: 1,
          title: "Coffee Mug",
          status: "active",
          hot_score: 5,
          expires_at: null,
          lat: null,
          lng: null,
        },
        // Post 2: Aligned with user vector
        {
          id: 2,
          title: "Biology Book",
          status: "active",
          hot_score: 5,
          expires_at: null,
          lat: null,
          lng: null,
        },
      ];

      // Count query: 2 posts found
      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 2 }]]) // 1. count query
        .mockResolvedValueOnce([candidatePosts]) // 2. candidate scoring query
        .mockResolvedValueOnce([candidatePosts]); // 3. fetchPostsByIds hydration query

      // Realistic 1536-dimensional Float32 vectors
      const userVec = new Array(1536).fill(0);
      userVec[0] = 1.0;
      const userVectorBuf = createFloat32Buffer(userVec);

      // Post 1: Orthogonal vector (dimension 1 = 1.0 -> dot product 0.0)
      const post1Vec = new Array(1536).fill(0);
      post1Vec[1] = 1.0;
      const post1Buf = createFloat32Buffer(post1Vec);

      // Post 2: Aligned vector (dimension 0 = 1.0 -> dot product 1.0)
      const post2Vec = new Array(1536).fill(0);
      post2Vec[0] = 1.0;
      const post2Buf = createFloat32Buffer(post2Vec);

      // Mock Redis Pipeline returning candidate Float32 buffers
      mockRedis.sendCommand.mockImplementation((args: unknown) => {
        const cmd = args as string[];
        if (Array.isArray(cmd) && cmd[0] === "HGET") {
          if (cmd[1] === "post:1") return Promise.resolve(post1Buf);
          if (cmd[1] === "post:2") return Promise.resolve(post2Buf);
        }
        return Promise.resolve(null);
      });

      const result = await service.getFilteredFeed({}, userVectorBuf);

      expect(result.posts).toHaveLength(2);
      // Post 2 should be ranked 1st because of higher vector similarity (1.0 vs 0.0)
      expect(result.posts[0].id).toBe(2);
      expect(result.posts[1].id).toBe(1);
      expect(result.isPersonalized).toBe(true);
    });

    it("gracefully falls back to neutral similarity when candidate vector is not found in Redis", async () => {
      const service = new FeedService();

      const candidatePosts = [
        {
          id: 1,
          title: "Post without vector",
          status: "active",
          hot_score: 10,
          expires_at: null,
          lat: null,
          lng: null,
        },
      ];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([candidatePosts])
        .mockResolvedValueOnce([candidatePosts]);

      // User vector provided, but Redis returns null for post:1
      const userVec = new Array(1536).fill(0);
      userVec[0] = 1.0;
      const userVectorBuf = createFloat32Buffer(userVec);

      mockRedis.sendCommand.mockResolvedValue(null);

      const result = await service.getFilteredFeed({}, userVectorBuf);

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toBe(1);
      expect(result.isPersonalized).toBe(true);
    });

    it("counts failed and missing candidate vector reads instead of hiding them", async () => {
      const service = new FeedService();
      const candidatePosts = [1, 2, 3].map((id) => ({
        id,
        status: "active",
        hot_score: 1,
        expires_at: null,
        lat: null,
        lng: null,
      }));

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 3 }]])
        .mockResolvedValueOnce([candidatePosts])
        .mockResolvedValueOnce([candidatePosts]);

      const userVec = new Array(1536).fill(0);
      userVec[0] = 1.0;
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

      // post:1 有向量、post:2 不存在、post:3 因 client 佇列已滿而失敗
      mockRedis.sendCommand.mockImplementation((args: unknown) => {
        const [command, key] = args as string[];
        if (command !== "HGET") return Promise.resolve(null);
        if (key === "post:1") return Promise.resolve(createFloat32Buffer(userVec));
        if (key === "post:3") return Promise.reject(new Error("The queue is full"));
        return Promise.resolve(null);
      });

      const result = await service.getFilteredFeed({}, createFloat32Buffer(userVec));

      expect(result.posts).toHaveLength(3);
      expect(getCandidateVectorReadStats()).toEqual({ reads: 3, failed: 1, missing: 1, cacheHits: 0 });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]).toEqual([
        expect.stringContaining("1/3 candidate vector reads failed"),
        "The queue is full",
      ]);
      warn.mockRestore();
    });

    it("applies geo boost for closer posts when coordinates are supplied", async () => {
      const service = new FeedService();

      const candidatePosts = [
        // Post 1: 50km away (no boost), equal hot_score
        {
          id: 1,
          title: "Far away desk",
          status: "active",
          hot_score: 10,
          embedding: null,
          expires_at: null,
          lat: 25.4,
          lng: 121.5,
        },
        // Post 2: 2km away (<=5km gets 1.2x boost), equal hot_score
        {
          id: 2,
          title: "Nearby desk",
          status: "active",
          hot_score: 10,
          embedding: null,
          expires_at: null,
          lat: 25.034,
          lng: 121.564,
        },
      ];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 2 }]]) // 1. count query
        .mockResolvedValueOnce([candidatePosts]) // 2. candidate scoring query
        .mockResolvedValueOnce([candidatePosts]); // 3. fetchPostsByIds hydration query

      const result = await service.getFilteredFeed(
        { lat: 25.033, lng: 121.565 }, // user location
        null,
      );

      expect(result.posts).toHaveLength(2);
      // Post 2 is ranked 1st due to geo boost
      expect(result.posts[0].id).toBe(2);
      expect(result.posts[1].id).toBe(1);
    });
  });

  describe("full-hydration baseline (benchmark only)", () => {
    // 同一份資料以 MySQL 列與 Redis 向量兩種形式提供，驗證 baseline 與現行策略的業務結果一致
    const vectorFor = (id: number): number[] => {
      const vec = new Array(1536).fill(0);
      vec[id % 3] = 1;
      vec[3] = id / 10;
      return vec;
    };
    const posts = [1, 2, 3, 4].map((id) => ({
      id,
      public_id: `post-${id}`,
      title: `Post ${id}`,
      status: "active",
      hot_score: 10 - id,
      expires_at: id === 4 ? "2020-01-01T00:00:00.000Z" : null,
      lat: 25 + id / 100,
      lng: 121.5,
      s3_keys: `benchmark/posts/${id}.jpg`,
    }));
    const LIGHT_COLUMNS = ["id", "hot_score", "expires_at", "status", "lat", "lng"];

    function mockDatabase(likedPostIds: number[] = []): void {
      (dbPool.execute as jest.Mock).mockImplementation(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("COUNT(")) return [[{ total: posts.length }]];
        if (sql.includes("FROM post_likes")) {
          const ids = params.slice(1) as number[];
          return [likedPostIds.filter((id) => ids.includes(id)).map((post_id) => ({ post_id }))];
        }
        const idFilter = sql.includes("p.id IN") ? (params as number[]) : null;
        const matching = posts
          .filter((post) => !idFilter || idFilter.includes(post.id))
          .sort((a, b) => b.hot_score - a.hot_score || b.id - a.id);
        if (sql.includes("GROUP_CONCAT")) {
          const withEmbedding = sql.includes("p.embedding");
          return [
            matching.map((post) => ({
              ...post,
              ...(withEmbedding ? { embedding: JSON.stringify(vectorFor(post.id)) } : {}),
            })),
          ];
        }
        return [
          matching.map((post) =>
            Object.fromEntries(LIGHT_COLUMNS.map((column) => [column, post[column as keyof typeof post]])),
          ),
        ];
      });
    }

    function mockRedisVectors(): void {
      mockRedis.sendCommand.mockImplementation(async (args: unknown) => {
        const [command, key] = args as string[];
        if (command === "HGET") {
          return createFloat32Buffer(vectorFor(Number(key.replace("post:", ""))));
        }
        if (command === "FT.SEARCH") {
          return [3, "post:3", ["vector_distance", "0.1"], "post:1", ["vector_distance", "0.2"], "post:2", ["vector_distance", "0.3"]];
        }
        return null;
      });
    }

    const userVector = () => createFloat32Buffer([1, ...new Array(1535).fill(0)]);

    it.each([
      ["filtered feed", { category_id: 3, userId: 7, limit: 2, page: 1 }],
      ["filtered feed page 2 with geo boost", { type: "share", userId: 7, limit: 2, page: 2, lat: 25.03, lng: 121.5 }],
      ["tinder feed", { mode: "tinder", userId: 7, limit: 3, lat: 25.03, lng: 121.5 }],
      ["personalized feed", { userId: 7, limit: 2 }],
    ])("returns the same business result as late materialization for the %s", async (_label, params) => {
      mockDatabase([1, 3]);
      mockRedisVectors();
      const service = new FeedService();
      jest.spyOn(service, "getUserVector").mockResolvedValue(userVector());

      const current = await service.getFeed(params);
      clearVectorMemoryCachesForTest();
      const baseline = await service.getFeed({ ...params, fullHydrationBaseline: true });

      expect(current.posts.length).toBeGreaterThan(0);
      expect(baseline).toEqual(current);
    });

    it("ranks filtered candidates with embeddings hydrated from MySQL rather than Redis", async () => {
      mockDatabase();
      mockRedis.sendCommand.mockResolvedValue(null);
      const service = new FeedService();

      const baseline = await service.getFilteredFeed(
        { category_id: 3, fullHydrationBaseline: true },
        userVector(),
      );

      // post 3 與使用者向量 (dimension 0) 完全對齊，因此排在熱度較高的 post 1、2 之前
      expect(baseline.posts[0].id).toBe(3);
      expect(getCandidateVectorReadStats().reads).toBe(0);
    });
  });
});
