import { FeedService, feedService } from "./feedService";
import { getRedisClient } from "../utils/redis";
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
    mockRedis = {
      sendCommand: jest.fn(),
      zCard: jest.fn().mockResolvedValue(0),
      zRange: jest.fn().mockResolvedValue([]),
    };
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
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
          pagination: { currentPage: 1, totalPages: 1, totalPosts: 0, postsPerPage: 20 },
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
          pagination: { currentPage: 1, totalPages: 1, totalPosts: 0, postsPerPage: 20 },
          isPersonalized: true,
        });

      await feedService.getFeed({ userId: 10 });

      expect(getPersonalizedFeedSpy).toHaveBeenCalledTimes(1);
    });

    it("routes to trending feed for cold start (new/guest user without vector)", async () => {
      jest.spyOn(feedService, "getUserVector").mockResolvedValue(null);
      const getTrendingFeedSpy = jest
        .spyOn(feedService, "getTrendingFeed")
        .mockResolvedValue({
          posts: [],
          pagination: { currentPage: 1, totalPages: 1, totalPosts: 0, postsPerPage: 20 },
          isPersonalized: false,
        });

      await feedService.getFeed({});

      expect(getTrendingFeedSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("getFilteredFeed Hybrid Scoring", () => {
    it("correctly ranks posts matching user interest vector higher", async () => {
      const service = new FeedService();

      // Count query: 2 posts found
      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 2 }]]) // count query
        .mockResolvedValueOnce([
          [
            // Post 1: Orthogonal to user vector ([0, 1])
            {
              id: 1,
              title: "Coffee Mug",
              status: "active",
              hot_score: 5,
              embedding: JSON.stringify([0, 1]),
              expires_at: null,
              lat: null,
              lng: null,
            },
            // Post 2: Aligned with user vector ([1, 0])
            {
              id: 2,
              title: "Biology Book",
              status: "active",
              hot_score: 5,
              embedding: JSON.stringify([1, 0]),
              expires_at: null,
              lat: null,
              lng: null,
            },
          ],
        ]);

      // User vector is [1, 0]
      const userVectorBuf = createFloat32Buffer([1, 0]);

      const result = await service.getFilteredFeed({}, userVectorBuf);

      expect(result.posts).toHaveLength(2);
      // Post 2 should be ranked 1st because of higher vector similarity (1.0 vs 0.0)
      expect(result.posts[0].id).toBe(2);
      expect(result.posts[1].id).toBe(1);
      expect(result.isPersonalized).toBe(true);
    });

    it("applies geo boost for closer posts when coordinates are supplied", async () => {
      const service = new FeedService();

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ total: 2 }]])
        .mockResolvedValueOnce([
          [
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
          ],
        ]);

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
