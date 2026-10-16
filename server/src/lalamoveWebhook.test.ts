import crypto from "crypto";
import { Request, Response, RequestHandler } from "express";
import lalamoveRouter, { getWebhookEventTime } from "./lalamove";
import dbPool from "./utils/db";
import { verifyLalamoveWebhookSignature } from "./services/lalamove";
import { enqueueDeliveryRefund } from "./queue/queues";
import { adoptLalamoveOrder } from "./services/deliveryRecovery";

jest.mock("./utils/db", () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

jest.mock("./queue/queues", () => ({
  enqueueDeliveryRefund: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./services/deliveryRecovery", () => ({
  adoptLalamoveOrder: jest.fn().mockResolvedValue({ result: "ADOPTED", deliveryOrderId: 7 }),
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: () => void) => next(),
}));

const SECRET = "test-secret";
const NOW = 1_700_000_000_000;

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}\r\nPOST\r\n/api/lalamove/webhook\r\n\r\n${rawBody}`)
    .digest("hex");
}

describe("verifyLalamoveWebhookSignature", () => {
  const originalEnv = { ...process.env };
  const body = JSON.stringify({ eventType: "ORDER_STATUS_CHANGED" });
  const ts = String(NOW);

  beforeEach(() => {
    process.env.LALAMOVE_API_SECRET = SECRET;
    process.env.NODE_ENV = "test";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("accepts a valid signature over the raw body", () => {
    expect(verifyLalamoveWebhookSignature(body, sign(body, ts), ts, NOW)).toBe(true);
  });

  it("accepts t=...,v1=... header format", () => {
    const header = `t=${ts},v1=${sign(body, ts)}`;
    expect(verifyLalamoveWebhookSignature(body, header, undefined, NOW)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyLalamoveWebhookSignature(`${body} `, sign(body, ts), ts, NOW),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(
      verifyLalamoveWebhookSignature(body, sign(body, ts, "other"), ts, NOW),
    ).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyLalamoveWebhookSignature(body, undefined, ts, NOW)).toBe(false);
  });

  it("rejects a signature of different length without throwing", () => {
    expect(verifyLalamoveWebhookSignature(body, "abc", ts, NOW)).toBe(false);
  });

  it("rejects stale timestamps (replay)", () => {
    const old = String(NOW - 10 * 60 * 1000);
    expect(verifyLalamoveWebhookSignature(body, sign(body, old), old, NOW)).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verifyLalamoveWebhookSignature(body, sign(body, "x"), "x", NOW)).toBe(false);
  });

  it("allows missing secret outside production", () => {
    delete process.env.LALAMOVE_API_SECRET;
    process.env.NODE_ENV = "development";
    expect(verifyLalamoveWebhookSignature(body, undefined, undefined, NOW)).toBe(true);
  });

  it("rejects missing secret in production", () => {
    delete process.env.LALAMOVE_API_SECRET;
    process.env.NODE_ENV = "production";
    expect(verifyLalamoveWebhookSignature(body, undefined, undefined, NOW)).toBe(false);
  });
});

describe("POST /webhook handler", () => {
  const originalEnv = { ...process.env };
  const layers = (
    lalamoveRouter as unknown as {
      stack: {
        route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] };
      }[];
    }
  ).stack;
  const handler = layers.find((l) => l.route?.path === "/webhook" && l.route.methods.post)!
    .route!.stack[0].handle;

  function mockRes() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {},
    };
    return res as unknown as Response & typeof res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LALAMOVE_API_SECRET = SECRET;
    process.env.NODE_ENV = "test";
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function makeReq(raw: string, headers: Record<string, string> = {}) {
    return {
      body: Buffer.from(raw),
      headers,
      app: { get: jest.fn() },
    } as unknown as Request;
  }

  it("returns 401 and does not touch DB when signature is invalid", async () => {
    const raw = JSON.stringify({
      eventType: "ORDER_STATUS_CHANGED",
      data: { order: { orderId: "O1", status: "COMPLETED" } },
    });
    const res = mockRes();
    await handler(makeReq(raw, { "x-llm-signature": "bad", "x-llm-timestamp": String(Date.now()) }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(dbPool.query).not.toHaveBeenCalled();
    expect(dbPool.execute).not.toHaveBeenCalled();
  });

  it("returns 401 when signature header is missing", async () => {
    const res = mockRes();
    await handler(makeReq("{}"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 in production when secret is not configured", async () => {
    delete process.env.LALAMOVE_API_SECRET;
    process.env.NODE_ENV = "production";
    const res = mockRes();
    await handler(makeReq("{}"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when body was not parsed as raw Buffer", async () => {
    const res = mockRes();
    const req = { body: { eventType: "X" }, headers: {}, app: { get: jest.fn() } } as unknown as Request;
    await handler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = mockRes();
    await handler(makeReq("not-json"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepts a correctly signed webhook (raw body) and responds 200", async () => {
    const raw = JSON.stringify({ eventType: "UNKNOWN_EVENT", data: {} });
    const ts = String(Date.now());
    const res = mockRes();
    await handler(
      makeReq(raw, { "x-llm-signature": sign(raw, ts), "x-llm-timestamp": ts }),
      res,
      jest.fn(),
    );
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  function signedStatusReq(status: string, updatedAt = "2026-10-15T08:00:00.000Z") {
    const raw = JSON.stringify({
      eventType: "ORDER_STATUS_CHANGED",
      eventId: "E1",
      data: { order: { orderId: "O1", status }, updatedAt },
    });
    const ts = String(Date.now());
    const emit = jest.fn();
    const req = makeReq(raw, { "x-llm-signature": sign(raw, ts), "x-llm-timestamp": ts });
    (req.app.get as jest.Mock).mockReturnValue({ to: jest.fn().mockReturnValue({ emit }) });
    return { req, emit };
  }

  it("guards status UPDATE with valid predecessor statuses", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 7 }]]) // SELECT id
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // guarded UPDATE
      .mockResolvedValueOnce([{}]); // INSERT event
    const { req, emit } = signedStatusReq("PICKED_UP");
    const res = mockRes();
    await handler(req, res, jest.fn());

    const [sql, params] = (dbPool.query as jest.Mock).mock.calls[1];
    expect(sql).toContain("AND status IN (?)");
    expect(sql).toContain("status_updated_at IS NULL OR status_updated_at <= ?");
    expect(params[2]).toEqual(new Date("2026-10-15T08:00:00.000Z"));
    expect(params[3]).toBeNull(); // failure_reason untouched for non-failure status
    expect(params[5]).toEqual(["ASSIGNING_DRIVER", "ON_GOING"]);
    expect(params[6]).toEqual(new Date("2026-10-15T08:00:00.000Z"));
    expect(enqueueDeliveryRefund).not.toHaveBeenCalled();
    expect((dbPool.query as jest.Mock).mock.calls[2][0]).toContain("INSERT INTO delivery_order_events");
    expect(emit).toHaveBeenCalledWith("delivery_update", expect.objectContaining({ status: "PICKED_UP" }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("REJECTED: records failure reason and enqueues auto-refund", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 7 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{}]);
    const { req } = signedStatusReq("REJECTED");
    await handler(req, mockRes(), jest.fn());

    const params = (dbPool.query as jest.Mock).mock.calls[1][1];
    expect(params[0]).toBe("FAILED");
    expect(params[3]).toBe("LALAMOVE_REJECTED");
    expect(enqueueDeliveryRefund).toHaveBeenCalledWith({
      deliveryOrderId: 7,
      reason: "LALAMOVE_REJECTED",
    });
  });

  it("does not enqueue refund when the REJECTED event is rejected by the guard", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 7 }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    const { req } = signedStatusReq("REJECTED");
    await handler(req, mockRes(), jest.fn());
    expect(enqueueDeliveryRefund).not.toHaveBeenCalled();
  });

  it("ORDER_CREATED for an unknown orderId adopts it by quotationId, then applies the status", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[]]) // SELECT by lalamove_order_id → unknown
      .mockResolvedValueOnce([[{ id: 7 }]]) // re-SELECT after adoption
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // ASSIGNING_DRIVER already set by adoption
    const raw = JSON.stringify({
      eventType: "ORDER_CREATED",
      eventId: "E2",
      data: {
        order: { orderId: "O9", quotationId: "Q9", status: "ASSIGNING_DRIVER", shareLink: "https://s" },
        updatedAt: "2026-10-15T08:00:00.000Z",
      },
    });
    const ts = String(Date.now());
    const res = mockRes();
    await handler(
      makeReq(raw, { "x-llm-signature": sign(raw, ts), "x-llm-timestamp": ts }),
      res,
      jest.fn(),
    );

    expect(adoptLalamoveOrder).toHaveBeenCalledWith(dbPool, expect.any(Function), {
      lalamoveOrderId: "O9",
      quotationId: "Q9",
      shareLink: "https://s",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not try adoption for a known orderId", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 7 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{}]);
    const { req } = signedStatusReq("PICKED_UP");
    await handler(req, mockRes(), jest.fn());
    expect(adoptLalamoveOrder).not.toHaveBeenCalled();
  });

  it("ignores an out-of-order status (no event row, no status broadcast)", async () => {
    (dbPool.query as jest.Mock)
      .mockResolvedValueOnce([[{ id: 7 }]]) // SELECT id
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // guard rejects (e.g. already COMPLETED)
    const { req, emit } = signedStatusReq("ON_GOING");
    const res = mockRes();
    await handler(req, res, jest.fn());

    expect(dbPool.query).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][1]).not.toHaveProperty("status");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("getWebhookEventTime", () => {
  const now = new Date("2026-10-15T00:00:00.000Z");

  it("prefers data.updatedAt (ISO string)", () => {
    expect(
      getWebhookEventTime(
        { timestamp: 1, data: { updatedAt: "2026-10-15T08:00:00.123Z" } },
        now,
      ),
    ).toEqual(new Date("2026-10-15T08:00:00.123Z"));
  });

  it("falls back to top-level timestamp in seconds or milliseconds", () => {
    expect(getWebhookEventTime({ timestamp: 1_792_000_000 }, now)).toEqual(
      new Date(1_792_000_000_000),
    );
    expect(getWebhookEventTime({ timestamp: "1792000000123" }, now)).toEqual(
      new Date(1_792_000_000_123),
    );
  });

  it("falls back to receive time when no usable timestamp", () => {
    expect(getWebhookEventTime({ data: { updatedAt: "garbage" } }, now)).toBe(now);
  });
});
