import type { Socket } from "socket.io";
import dbPool from "./utils/db";
import * as sessionModule from "./session";
import { authenticateSocket, handleJoinDelivery } from "./socketHandlers";

jest.mock("./utils/db", () => ({
  query: jest.fn(),
}));

jest.mock("./session", () => ({
  getUserFromCookies: jest.fn(),
}));

const mockQuery = dbPool.query as jest.Mock;
const mockGetUserFromCookies = sessionModule.getUserFromCookies as jest.Mock;

const buyer = { userId: 1, email: "buyer@test.com", role: "user" };
const seller = { userId: 2, email: "seller@test.com", role: "user" };
const stranger = { userId: 3, email: "stranger@test.com", role: "user" };
const admin = { userId: 99, email: "admin@test.com", role: "admin" };

function fakeSocket(user?: object, cookies?: Record<string, string>) {
  return {
    id: "socket-1",
    data: user ? { user } : {},
    request: { cookies },
    join: jest.fn(),
  } as unknown as Socket & { join: jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("authenticateSocket", () => {
  it("rejects a handshake without a valid session", async () => {
    mockGetUserFromCookies.mockResolvedValue(null);
    const socket = fakeSocket(undefined, {});
    const next = jest.fn();

    await authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Unauthorized");
    expect(socket.data.user).toBeUndefined();
  });

  it("attaches the session user to socket.data", async () => {
    mockGetUserFromCookies.mockResolvedValue(buyer);
    const socket = fakeSocket(undefined, { "session-id": "abc" });
    const next = jest.fn();

    await authenticateSocket(socket, next);

    expect(mockGetUserFromCookies).toHaveBeenCalledWith({ "session-id": "abc" });
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual(buyer);
  });

  it("fails closed when the session lookup throws", async () => {
    mockGetUserFromCookies.mockRejectedValue(new Error("redis down"));
    const socket = fakeSocket(undefined, { "session-id": "abc" });
    const next = jest.fn();

    await authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data.user).toBeUndefined();
  });
});

describe("handleJoinDelivery", () => {
  const orderRow = [[{ user_id: buyer.userId, seller_user_id: seller.userId }]];

  it.each([
    ["buyer", buyer],
    ["seller", seller],
  ])("lets the %s join the delivery room", async (_label, user) => {
    mockQuery.mockResolvedValue(orderRow);
    const socket = fakeSocket(user);
    const ack = jest.fn();

    await handleJoinDelivery(socket, "LL-123", ack);

    expect(socket.join).toHaveBeenCalledWith("delivery_LL-123");
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("forbids a user who is neither buyer nor seller", async () => {
    mockQuery.mockResolvedValue(orderRow);
    const socket = fakeSocket(stranger);
    const ack = jest.fn();

    await handleJoinDelivery(socket, "LL-123", ack);

    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: "Forbidden" });
  });

  it("forbids joining a nonexistent order", async () => {
    mockQuery.mockResolvedValue([[]]);
    const socket = fakeSocket(buyer);

    await handleJoinDelivery(socket, "LL-404");

    expect(socket.join).not.toHaveBeenCalled();
  });

  it("lets an admin join without an ownership lookup", async () => {
    const socket = fakeSocket(admin);

    await handleJoinDelivery(socket, "LL-123");

    expect(mockQuery).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith("delivery_LL-123");
  });

  it.each([[123], [""], [{ id: 1 }], ["x".repeat(65)]])(
    "rejects invalid orderId %p",
    async (orderId) => {
      const socket = fakeSocket(buyer);
      const ack = jest.fn();

      await handleJoinDelivery(socket, orderId, ack);

      expect(mockQuery).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ ok: false, error: "Invalid orderId" });
    },
  );

  it("does not join when the DB lookup fails", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    const socket = fakeSocket(buyer);
    const ack = jest.fn();

    await handleJoinDelivery(socket, "LL-123", ack);

    expect(socket.join).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: "Internal server error" });
  });
});
