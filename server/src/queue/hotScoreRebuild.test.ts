import { requestHotScoreRebuild, hotScoreQueue } from "./queues";
import { getCacheRedisClient } from "../utils/redis";

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue({}) })),
}));
jest.mock("../utils/redis");

describe("requestHotScoreRebuild", () => {
  const mockRedis = { set: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCacheRedisClient as jest.Mock).mockReturnValue(mockRedis);
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("enqueues a rebuild job when it acquires the cooldown lock", async () => {
    mockRedis.set.mockResolvedValue("OK");

    expect(await requestHotScoreRebuild()).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith("hot-score:rebuild-lock", "1", {
      NX: true,
      EX: 60,
    });
    expect(hotScoreQueue.add).toHaveBeenCalledWith("calculate-hot-score", {});
  });

  it("skips enqueueing while another request holds the lock", async () => {
    mockRedis.set.mockResolvedValue(null);

    expect(await requestHotScoreRebuild()).toBe(false);
    expect(hotScoreQueue.add).not.toHaveBeenCalled();
  });
});
