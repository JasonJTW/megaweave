import {
  createShutdown,
  FORCE_CLOSE_CONNECTIONS_MS,
  FORCED_EXIT_MS,
} from "./gracefulShutdown";

//* 假的 server：close 的回呼要等測試呼叫 finishClose 才會執行，模擬「還有連線沒斷」
function setup(cleanup: () => Promise<void> = async () => {}) {
  let onClosed: (() => Promise<void> | void) | null = null;
  const server = {
    close: jest.fn((cb: () => Promise<void> | void) => {
      onClosed = cb;
    }),
    closeIdleConnections: jest.fn(),
    closeAllConnections: jest.fn(),
  };
  const io = { close: jest.fn() };
  const exit = jest.fn();
  const cleanupMock = jest.fn(cleanup);
  const shutdown = createShutdown({
    server,
    io,
    cleanup: cleanupMock,
    exit,
    log: { log: jest.fn(), error: jest.fn() },
  });
  const finishClose = async () => {
    await onClosed?.();
  };
  return { server, io, exit, cleanup: cleanupMock, shutdown, finishClose };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("createShutdown", () => {
  it("runs the cleanup and exits 0 once the server has closed on a single signal", async () => {
    const { server, io, exit, cleanup, shutdown, finishClose } = setup();

    shutdown("SIGINT");
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(io.close).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    await finishClose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 when the cleanup fails", async () => {
    const { exit, shutdown, finishClose } = setup(async () => {
      throw new Error("redis down");
    });

    shutdown("SIGTERM");
    await finishClose();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits at once on a second signal, skipping the cleanup and a second close", () => {
    const { server, exit, cleanup, shutdown } = setup();

    shutdown("SIGINT");
    shutdown("SIGINT");

    expect(exit).toHaveBeenCalledWith(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("force-closes lingering connections after 5s, then exits 1 at 30s if close never finishes", () => {
    const { server, exit, shutdown } = setup();

    shutdown("SIGINT");
    jest.advanceTimersByTime(FORCE_CLOSE_CONNECTIONS_MS - 1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(FORCED_EXIT_MS - FORCE_CLOSE_CONNECTIONS_MS);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
