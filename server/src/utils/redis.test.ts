import { createRecoveryScheduler } from "./redis";
import type * as RedisModule from "./redis";

describe("createRecoveryScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const makeClient = (isOpen = false) => ({
    isOpen,
    connect: jest.fn().mockResolvedValue(undefined),
  });

  it("reconnects a closed client after the delay", async () => {
    const client = makeClient();
    const recovery = createRecoveryScheduler("test", client, 1000, () => false);

    recovery.schedule();
    await jest.advanceTimersByTimeAsync(999);
    expect(client.connect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("only keeps one pending attempt when scheduled repeatedly", async () => {
    const client = makeClient();
    const recovery = createRecoveryScheduler("test", client, 1000, () => false);

    recovery.schedule();
    recovery.schedule();
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("can schedule again after a failed attempt", async () => {
    const client = makeClient();
    client.connect.mockRejectedValueOnce(new Error("still down"));
    const recovery = createRecoveryScheduler("test", client, 1000, () => false);

    recovery.schedule();
    await jest.advanceTimersByTimeAsync(1000);
    recovery.schedule();
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.connect).toHaveBeenCalledTimes(2);
  });

  it("skips the attempt if the client was reopened meanwhile", async () => {
    const client = makeClient(true);
    const recovery = createRecoveryScheduler("test", client, 1000, () => false);

    recovery.schedule();
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("does nothing while shutting down or after cancel", async () => {
    const client = makeClient();
    let shuttingDown = true;
    const recovery = createRecoveryScheduler("test", client, 1000, () => shuttingDown);

    recovery.schedule();
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.connect).not.toHaveBeenCalled();

    shuttingDown = false;
    recovery.schedule();
    recovery.cancel();
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.connect).not.toHaveBeenCalled();
  });
});

describe("connectRedis", () => {
  // Fresh module per test so connectionPromise state doesn't leak between tests.
  const loadRedis = (): typeof RedisModule => {
    let mod!: typeof RedisModule;
    jest.isolateModules(() => {
      mod = jest.requireActual("./redis");
    });
    return mod;
  };

  const stubClient = (
    client: RedisModule.AppRedisClient,
    state: { isOpen: boolean; isReady: boolean },
  ) => {
    jest.spyOn(client, "isOpen", "get").mockImplementation(() => state.isOpen);
    jest.spyOn(client, "isReady", "get").mockImplementation(() => state.isReady);
    return jest.spyOn(client, "connect").mockImplementation((async () => {
      state.isOpen = true;
      state.isReady = true;
      return client;
    }) as never);
  };

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not call connect() on a client that is already reconnecting", async () => {
    const redis = loadRedis();
    const cacheConnect = stubClient(redis.cacheRedisClient, { isOpen: true, isReady: false });
    const vectorConnect = stubClient(redis.vectorRedisClient, { isOpen: true, isReady: true });

    await expect(redis.connectRedis()).resolves.toBeUndefined();
    expect(cacheConnect).not.toHaveBeenCalled();
    expect(vectorConnect).not.toHaveBeenCalled();
    expect(redis.isRedisConnected()).toBe(false);
  });

  it("connects only the closed client when the other is reconnecting", async () => {
    const redis = loadRedis();
    const cacheConnect = stubClient(redis.cacheRedisClient, { isOpen: true, isReady: false });
    const vectorConnect = stubClient(redis.vectorRedisClient, { isOpen: false, isReady: false });

    await redis.connectRedis();
    expect(cacheConnect).not.toHaveBeenCalled();
    expect(vectorConnect).toHaveBeenCalledTimes(1);
  });

  it("connects closed clients", async () => {
    const redis = loadRedis();
    const cacheConnect = stubClient(redis.cacheRedisClient, { isOpen: false, isReady: false });
    const vectorConnect = stubClient(redis.vectorRedisClient, { isOpen: false, isReady: false });

    await redis.connectRedis();
    expect(cacheConnect).toHaveBeenCalledTimes(1);
    expect(vectorConnect).toHaveBeenCalledTimes(1);
    expect(redis.isRedisConnected()).toBe(true);
  });
});
