import { startWorkers, stopWorkers, getActiveWorkers } from "./workers";

jest.mock("bullmq", () => {
  const original = jest.requireActual("bullmq");
  return {
    ...original,
    Worker: jest.fn().mockImplementation((queueName: string) => {
      return {
        name: queueName,
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

jest.mock("./queues", () => ({
  initUserVectorFlushCron: jest.fn().mockResolvedValue(undefined),
  initDeliveryReconcileCron: jest.fn().mockResolvedValue(undefined),
}));

interface MockBullMQWorker {
  name: string;
  close: jest.Mock;
}

describe("Worker Lifecycle & Graceful Shutdown (Slice 2)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await stopWorkers();
  });

  it("should start all 7 workers and track them in getActiveWorkers", async () => {
    await startWorkers();
    const workers = getActiveWorkers() as unknown as MockBullMQWorker[];

    expect(workers.length).toBe(7);
    const workerNames = workers.map((w) => w.name);
    expect(workerNames).toContain("post-image");
    expect(workerNames).toContain("email");
    expect(workerNames).toContain("post-embedding");
    expect(workerNames).toContain("user-vector");
    expect(workerNames).toContain("hot-score");
    expect(workerNames).toContain("user-vector-flush");
    expect(workerNames).toContain("delivery-reconcile");
  });

  it("should gracefully close all workers on stopWorkers() and empty active workers", async () => {
    await startWorkers();
    const workers = getActiveWorkers() as unknown as MockBullMQWorker[];
    expect(workers.length).toBe(7);

    const closeMocks = workers.map((w) => w.close);

    await stopWorkers();

    closeMocks.forEach((closeFn: jest.Mock) => {
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    expect(getActiveWorkers().length).toBe(0);
  });

  it("should be idempotent and safe when stopWorkers() is called multiple times or when no workers are active", async () => {
    await expect(stopWorkers()).resolves.toBeUndefined();
    await expect(stopWorkers()).resolves.toBeUndefined();
  });
});
