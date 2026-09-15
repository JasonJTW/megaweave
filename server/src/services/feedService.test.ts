import {
  FeedService,
  feedService,
  clearVectorMemoryCachesForTest,
} from "./feedService";
import { getRedisClient, getCacheRedisClient, getVectorRedisClient } from "../utils/redis";
import dbPool from "../utils/db";

jest.mock("../utils/redis");
jest.mock("../utils/db");

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
});
