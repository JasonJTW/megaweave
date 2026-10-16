import { processUserVectorFlush } from "./userVectorFlush";
import { getVectorRedisClient } from "../../utils/redis";
import dbPool from "../../utils/db";
import { Job } from "bullmq";

jest.mock("../../utils/redis");
jest.mock("../../utils/db");

interface MockRedisClient {
  sendCommand: jest.Mock;
  sRem: jest.Mock;
}

describe("userVectorFlush worker", () => {
  let mockRedis: MockRedisClient;
  let mockJob: Job;

  function createFloat32Buffer(vec: number[]): Buffer {
    const buf = Buffer.alloc(vec.length * 4);
    for (let i = 0; i < vec.length; i++) {
      buf.writeFloatLE(vec[i], i * 4);
    }
    return buf;
  }

  /** EVAL（claim script）回傳 popped；HGET 依 vectors 表回傳，值為 Error 時丟出 */
  function mockRedisData(
    popped: string[],
    vectors: Record<string, Buffer | null | Error>,
  ) {
    mockRedis.sendCommand.mockImplementation((args: string[]) => {
      if (args[0] === "EVAL") return Promise.resolve(popped);
      const value = vectors[args[1]];
      if (value instanceof Error) return Promise.reject(value);
      return Promise.resolve(value ?? null);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockRedis = {
      sendCommand: jest.fn(),
      sRem: jest.fn().mockResolvedValue(1),
    };
    (getVectorRedisClient as jest.Mock).mockReturnValue(mockRedis);
    mockJob = { log: jest.fn().mockResolvedValue(undefined) } as unknown as Job;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("claims a batch from dirty into processing atomically via EVAL", async () => {
    mockRedisData([], {});

    const result = await processUserVectorFlush(mockJob);

    expect(result).toEqual({ flushedCount: 0 });
    const [cmd, script, numKeys, dirtyKey, processingKey, batchSize] =
      mockRedis.sendCommand.mock.calls[0][0];
    expect(cmd).toBe("EVAL");
    expect(script).toContain("SUNIONSTORE");
    expect(script).toContain("SPOP");
    expect([numKeys, dirtyKey, processingKey, batchSize]).toEqual([
      "2",
      "user:vector:dirty",
      "user:vector:processing",
      "500",
    ]);
  });

  it("removes flushed users from processing after MySQL write succeeds", async () => {
    mockRedisData(["1", "2"], {
      "user:1:vector": createFloat32Buffer([1, 0]),
      "user:2:vector": createFloat32Buffer([0, 1]),
    });
    (dbPool.execute as jest.Mock).mockResolvedValue([{}]);

    const result = await processUserVectorFlush(mockJob);

    expect(result).toEqual({ flushedCount: 2 });
    expect(dbPool.execute).toHaveBeenCalledTimes(1);
    const [key, ids] = mockRedis.sRem.mock.calls[0];
    expect(key).toBe("user:vector:processing");
    expect([...ids].sort()).toEqual(["1", "2"]);
  });

  it("keeps the batch in processing and rethrows when the MySQL write fails", async () => {
    mockRedisData(["1", "2"], {
      "user:1:vector": createFloat32Buffer([1, 0]),
      "user:2:vector": createFloat32Buffer([0, 1]),
    });
    const dbError = new Error("ER_LOCK_DEADLOCK");
    (dbPool.execute as jest.Mock).mockRejectedValue(dbError);

    await expect(processUserVectorFlush(mockJob)).rejects.toBe(dbError);
    expect(mockRedis.sRem).not.toHaveBeenCalled();
  });

  it("keeps users whose Redis fetch failed in processing and flushes the rest", async () => {
    mockRedisData(["1", "2"], {
      "user:1:vector": createFloat32Buffer([1, 0]),
      "user:2:vector": new Error("ECONNRESET"),
    });
    (dbPool.execute as jest.Mock).mockResolvedValue([{}]);

    const result = await processUserVectorFlush(mockJob);

    expect(result).toEqual({ flushedCount: 1 });
    expect(mockRedis.sRem).toHaveBeenCalledWith("user:vector:processing", ["1"]);
  });

  it("releases users with no vector in Redis without writing MySQL", async () => {
    mockRedisData(["1"], { "user:1:vector": null });

    const result = await processUserVectorFlush(mockJob);

    expect(result).toEqual({ flushedCount: 0 });
    expect(dbPool.execute).not.toHaveBeenCalled();
    expect(mockRedis.sRem).toHaveBeenCalledWith("user:vector:processing", ["1"]);
  });

  it("does not fail the job when releasing processing fails after MySQL succeeded", async () => {
    mockRedisData(["1"], { "user:1:vector": createFloat32Buffer([1, 0]) });
    (dbPool.execute as jest.Mock).mockResolvedValue([{}]);
    mockRedis.sRem.mockRejectedValue(new Error("Redis down"));

    await expect(processUserVectorFlush(mockJob)).resolves.toEqual({
      flushedCount: 1,
    });
  });
});
