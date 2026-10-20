import dbPool from "./db";
import {
  acquireConnection,
  ConnectionAcquireTimeoutError,
} from "./acquireConnection";

jest.mock("./db", () => ({
  __esModule: true,
  default: { getConnection: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("acquireConnection", () => {
  it("returns the connection when the pool hands one over in time", async () => {
    const connection = { release: jest.fn() };
    (dbPool.getConnection as jest.Mock).mockResolvedValue(connection);
    await expect(acquireConnection(1000)).resolves.toBe(connection);
  });

  it("rejects once the wait exceeds the timeout", async () => {
    (dbPool.getConnection as jest.Mock).mockReturnValue(new Promise(() => {}));
    const result = acquireConnection(1000);
    jest.advanceTimersByTime(1000);
    await expect(result).rejects.toBeInstanceOf(ConnectionAcquireTimeoutError);
  });

  it("releases a connection that arrives after the timeout", async () => {
    const late = deferred<{ release: jest.Mock }>();
    (dbPool.getConnection as jest.Mock).mockReturnValue(late.promise);
    const result = acquireConnection(1000);
    jest.advanceTimersByTime(1000);
    await expect(result).rejects.toBeInstanceOf(ConnectionAcquireTimeoutError);

    const connection = { release: jest.fn() };
    late.resolve(connection);
    await late.promise;
    await Promise.resolve();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
