const emitterTo = jest.fn();
jest.mock("@socket.io/redis-emitter", () => ({
  Emitter: jest.fn().mockImplementation(() => ({ to: emitterTo })),
}));

describe("getSocketBroadcaster", () => {
  beforeEach(() => jest.resetModules());

  it("returns null when neither io nor emitter is set", async () => {
    const socket = await import("./socket");
    expect(socket.getSocketBroadcaster()).toBeNull();
  });

  it("falls back to the redis emitter in a standalone worker process", async () => {
    const socket = await import("./socket");
    socket.initSocketEmitter({} as never);
    const broadcaster = socket.getSocketBroadcaster();
    expect(broadcaster).not.toBeNull();
    broadcaster!.to("user_1");
    expect(emitterTo).toHaveBeenCalledWith("user_1");
  });

  it("prefers the in-process io when the API server set it", async () => {
    const socket = await import("./socket");
    const io = { to: jest.fn() };
    socket.initSocketEmitter({} as never);
    socket.setSocketIO(io as never);
    expect(socket.getSocketBroadcaster()).toBe(io);
  });
});
