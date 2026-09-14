// server/src/workerRunner.test.ts
import { runWorkerService } from "./workerRunner";

describe("Worker Runner Lifecycle (Slice 3)", () => {
  let mockConnectRedis: jest.Mock;
  let mockDisconnectRedis: jest.Mock;
  let mockCloseDatabase: jest.Mock;
  let mockStartWorkers: jest.Mock;
  let mockStopWorkers: jest.Mock;
  let mockInitHotScoreCron: jest.Mock;
  let mockExitProcess: jest.Mock;

  beforeEach(() => {
    mockConnectRedis = jest.fn().mockResolvedValue(undefined);
    mockDisconnectRedis = jest.fn().mockResolvedValue(undefined);
    mockCloseDatabase = jest.fn().mockResolvedValue(undefined);
    mockStartWorkers = jest.fn().mockResolvedValue(undefined);
    mockStopWorkers = jest.fn().mockResolvedValue(undefined);
    mockInitHotScoreCron = jest.fn().mockResolvedValue(undefined);
    mockExitProcess = jest.fn();
  });

  it("should boot redis, workers, and cron schedule in order", async () => {
    const service = await runWorkerService({
      connectRedis: mockConnectRedis,
      disconnectRedis: mockDisconnectRedis,
      closeDatabase: mockCloseDatabase,
      startWorkers: mockStartWorkers,
      stopWorkers: mockStopWorkers,
      initHotScoreCron: mockInitHotScoreCron,
      exitProcess: mockExitProcess,
    });

    expect(mockConnectRedis).toHaveBeenCalledTimes(1);
    expect(mockStartWorkers).toHaveBeenCalledTimes(1);
    expect(mockInitHotScoreCron).toHaveBeenCalledTimes(1);
    expect(service.isRunning).toBe(true);
  });

  it("should handle graceful shutdown in sequence: workers -> redis -> db -> exit", async () => {
    const executionOrder: string[] = [];

    mockStopWorkers.mockImplementation(async () => {
      executionOrder.push("stopWorkers");
    });
    mockDisconnectRedis.mockImplementation(async () => {
      executionOrder.push("disconnectRedis");
    });
    mockCloseDatabase.mockImplementation(async () => {
      executionOrder.push("closeDatabase");
    });

    const service = await runWorkerService({
      connectRedis: mockConnectRedis,
      disconnectRedis: mockDisconnectRedis,
      closeDatabase: mockCloseDatabase,
      startWorkers: mockStartWorkers,
      stopWorkers: mockStopWorkers,
      initHotScoreCron: mockInitHotScoreCron,
      exitProcess: mockExitProcess,
    });

    await service.shutdown("SIGTERM");

    expect(executionOrder).toEqual(["stopWorkers", "disconnectRedis", "closeDatabase"]);
    expect(mockExitProcess).toHaveBeenCalledWith(0);
    expect(service.isRunning).toBe(false);
  });

  it("should exit with code 1 if startup encounters an error", async () => {
    mockConnectRedis.mockRejectedValueOnce(new Error("Redis connection refused"));

    await runWorkerService({
      connectRedis: mockConnectRedis,
      disconnectRedis: mockDisconnectRedis,
      closeDatabase: mockCloseDatabase,
      startWorkers: mockStartWorkers,
      stopWorkers: mockStopWorkers,
      initHotScoreCron: mockInitHotScoreCron,
      exitProcess: mockExitProcess,
    });

    expect(mockExitProcess).toHaveBeenCalledWith(1);
  });
});
