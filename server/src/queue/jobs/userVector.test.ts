import { processUserVector, UserVectorJobData } from "./userVector";
import { getRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { Job } from "bullmq";

jest.mock("../../utils/redis");
jest.mock("../../utils/db");

interface MockRedisClient {
  sendCommand: jest.Mock;
  hSet: jest.Mock;
  sAdd: jest.Mock;
}

describe("userVector worker", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      sendCommand: jest.fn(),
      hSet: jest.fn().mockResolvedValue("OK"),
      sAdd: jest.fn().mockResolvedValue(1),
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

  function readFloat32Buffer(buf: Buffer): number[] {
    const vec: number[] = [];
    for (let i = 0; i < buf.length; i += 4) {
      vec.push(buf.readFloatLE(i));
    }
    return vec;
  }

  it("updates user vector on cold start using post vector and normalizes it", async () => {
    // Post vector: [1, 0]
    const postVector = [1, 0];
    const postBuf = createFloat32Buffer(postVector);

    // Mock Redis HGET post:123 v -> returns postBuf
    // Mock Redis HGET user:1:vector v -> returns null (cold start)
    mockRedis.sendCommand.mockImplementation((args: string[]) => {
      const key = args[1];
      if (key === "post:123") return Promise.resolve(postBuf);
      if (key === "user:1:vector") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    (dbPool.execute as jest.Mock).mockResolvedValue([[]]);

    const mockJob = {
      data: {
        userId: 1,
        postId: 123,
        action: "like", // alpha = 0.2
      } as UserVectorJobData,
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<UserVectorJobData>;

    await processUserVector(mockJob);

    expect(mockRedis.hSet).toHaveBeenCalledTimes(1);
    const [redisKey, payload] = mockRedis.hSet.mock.calls[0];
    expect(redisKey).toBe("user:1:vector");
    expect(payload.user_id).toBe(1);

    const savedVec = readFloat32Buffer(payload.v);
    // Cold start: (1 - 0.2) * [0, 0] + 0.2 * [1, 0] = [0.2, 0] -> normalized -> [1, 0]
    expect(savedVec[0]).toBeCloseTo(1.0, 5);
    expect(savedVec[1]).toBeCloseTo(0.0, 5);

    // Marked as dirty for batch MySQL write
    expect(mockRedis.sAdd).toHaveBeenCalledWith("user:vector:dirty", "1");
  });

  it("shifts user vector using EMA blended update on subsequent interactions", async () => {
    // Current user vector: [1, 0]
    const currentVec = [1, 0];
    const currentBuf = createFloat32Buffer(currentVec);

    // Target post vector: [0, 1]
    const postVec = [0, 1];
    const postBuf = createFloat32Buffer(postVec);

    mockRedis.sendCommand.mockImplementation((args: string[]) => {
      const key = args[1];
      if (key === "post:456") return Promise.resolve(postBuf);
      if (key === "user:2:vector") return Promise.resolve(currentBuf);
      return Promise.resolve(null);
    });

    const mockJob = {
      data: {
        userId: 2,
        postId: 456,
        action: "view", // alpha = 0.05
      } as UserVectorJobData,
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<UserVectorJobData>;

    await processUserVector(mockJob);

    expect(mockRedis.hSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockRedis.hSet.mock.calls[0];
    const updatedVec = readFloat32Buffer(payload.v);

    // Blended: (1 - 0.05)*[1,0] + 0.05*[0,1] = [0.95, 0.05]
    // Norm: sqrt(0.95^2 + 0.05^2) = sqrt(0.9025 + 0.0025) = sqrt(0.905) ≈ 0.95131
    // [0.95 / 0.95131, 0.05 / 0.95131] ≈ [0.9986, 0.0525]
    expect(updatedVec[0]).toBeCloseTo(0.9986, 3);
    expect(updatedVec[1]).toBeCloseTo(0.0525, 3);

    // Length of unit vector must be 1.0
    const norm = Math.sqrt(
      updatedVec.reduce((sum, v) => sum + v * v, 0),
    );
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it("gracefully skips update if post vector is missing", async () => {
    mockRedis.sendCommand.mockResolvedValue(null);
    (dbPool.execute as jest.Mock).mockResolvedValue([[]]);

    const mockJob = {
      data: {
        userId: 3,
        postId: 999,
        action: "weave",
      } as UserVectorJobData,
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<UserVectorJobData>;

    await processUserVector(mockJob);

    expect(mockRedis.hSet).not.toHaveBeenCalled();
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
  });
});
