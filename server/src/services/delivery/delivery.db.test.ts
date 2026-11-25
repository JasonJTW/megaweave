/**
 * DeliveryOrder module 對真的 MySQL：轉移的守衛（狀態機、比較並設定、事件時間）、稽核紀錄、
 * 付款連動、退款、推播，以及誰能看一張外送單（ADR 0001）。只 mock 退款佇列（Redis）
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import dbPool from "../../utils/db";
import { closeDatabase, resetDb } from "../../testUtils/db/reset";
import { createPost, createUser, type TestUser } from "../../testUtils/db/fixtures";
import { enqueueDeliveryRefund } from "../../queue/queues";
import { deliveryAccessFor, listOrdersOwedRefund, transitionDeliveryOrder, type DeliveryStatus } from ".";

jest.mock("../../queue/queues", () => ({
  enqueueDeliveryRefund: jest.fn().mockResolvedValue(undefined),
}));

const emits: Array<{ room: string; payload: { status: string } }> = [];
const io = {
  to: (room: string) => ({
    emit: (_event: string, payload: { status: string }) => emits.push({ room, payload }),
  }),
} as unknown as Server;

beforeAll(resetDb);
beforeEach(() => {
  jest.clearAllMocks();
  emits.length = 0;
});
afterAll(closeDatabase);

async function insert(sql: string, params: Array<string | number | null | Date>) {
  const [result] = await dbPool.execute<ResultSetHeader>(sql, params);
  return result.insertId;
}

async function location() {
  return insert("INSERT INTO locations (place_id, full_address, lat, lng) VALUES (?, 'Taipei', 25.03, 121.56)", [
    `place-${randomUUID()}`,
  ]);
}

async function order(
  orderer: TestUser,
  {
    status = "ASSIGNING_DRIVER",
    paymentStatus = "PAID",
    postId = null,
    weaveId = null,
    lalamoveOrderId = `LL-${randomUUID().slice(0, 8)}`,
  }: {
    status?: DeliveryStatus;
    paymentStatus?: string;
    postId?: number | null;
    weaveId?: number | null;
    lalamoveOrderId?: string | null;
  } = {},
) {
  const paymentId = await insert(
    "INSERT INTO payments (user_id, merchant_trade_no, amount, status) VALUES (?, ?, 150, ?)",
    [orderer.id, `MW${randomUUID().replace(/-/g, "").slice(0, 16)}`, paymentStatus],
  );
  const pickup = await location();
  const dropoff = await location();
  const id = await insert(
    `INSERT INTO delivery_orders (
       user_id, payment_id, post_id, weave_id, pickup_location_id, pickup_address_snapshot,
       dropoff_location_id, dropoff_address_snapshot, sender_name, sender_phone,
       recipient_name, recipient_phone, service_type, quotation_id, fee_total, expires_at,
       status, lalamove_order_id)
     VALUES (?, ?, ?, ?, ?, 'A', ?, 'B', 'S', '0900', 'R', '0911', 'MOTORCYCLE', ?, 150, ?, ?, ?)`,
    [
      orderer.id,
      paymentId,
      postId,
      weaveId,
      pickup,
      dropoff,
      `Q-${randomUUID()}`,
      new Date(Date.now() + 600_000),
      status,
      lalamoveOrderId,
    ],
  );
  return { id, paymentId, lalamoveOrderId };
}

async function row(id: number) {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT d.status, d.failure_reason, p.status AS payment_status FROM delivery_orders d JOIN payments p ON p.id = d.payment_id WHERE d.id = ?",
    [id],
  );
  return rows[0];
}

/** 讓外送單的最後變動落在退款補排的寬限期之前 */
async function ageOrder(id: number) {
  await dbPool.execute("UPDATE delivery_orders SET updated_at = NOW() - INTERVAL 1 HOUR WHERE id = ?", [id]);
}

async function events(id: number) {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT event_status FROM delivery_order_events WHERE delivery_order_id = ? ORDER BY id",
    [id],
  );
  return rows.map((r) => r.event_status);
}

describe("transitionDeliveryOrder guards", () => {
  it("applies a legal move and records one event", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ON_GOING" });
    const result = await transitionDeliveryOrder(dbPool, { id: o.id }, "PICKED_UP", {
      source: "sandbox",
      payload: { source: "test" },
    });
    expect(result).toEqual({ applied: true, deliveryOrderId: o.id, lalamoveOrderId: o.lalamoveOrderId });
    expect((await row(o.id)).status).toBe("PICKED_UP");
    expect(await events(o.id)).toEqual(["PICKED_UP"]);
  });

  it("refuses an illegal move (a late ON_GOING after COMPLETED) and writes nothing", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "COMPLETED" });
    const result = await transitionDeliveryOrder(dbPool, { id: o.id }, "ON_GOING", {
      source: "lalamove_webhook",
      payload: {},
      io,
    });
    expect(result.applied).toBe(false);
    expect((await row(o.id)).status).toBe("COMPLETED");
    expect(await events(o.id)).toEqual([]);
    expect(emits).toEqual([]);
  });

  it("gives up when the scanned status changed meanwhile (expectedFrom)", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "PICKED_UP" });
    const result = await transitionDeliveryOrder(dbPool, { id: o.id }, "COMPLETED", {
      source: "background_reconciliation_worker",
      expectedFrom: "ON_GOING",
      payload: {},
    });
    expect(result.applied).toBe(false);
    expect((await row(o.id)).status).toBe("PICKED_UP");
  });

  it("discards a webhook event older than the last applied one", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ASSIGNING_DRIVER" });
    const ref = { lalamoveOrderId: o.lalamoveOrderId! };
    await transitionDeliveryOrder(dbPool, ref, "ON_GOING", {
      source: "lalamove_webhook",
      eventTime: new Date("2026-10-15T08:05:00Z"),
      eventId: `E-${randomUUID()}`,
      payload: { e: 2 },
    });
    //* 司機拒單退回 ASSIGNING_DRIVER 是合法轉移，但這個事件比已套用的舊
    const stale = await transitionDeliveryOrder(dbPool, ref, "ASSIGNING_DRIVER", {
      source: "lalamove_webhook",
      eventTime: new Date("2026-10-15T08:00:00Z"),
      eventId: `E-${randomUUID()}`,
      payload: { e: 1 },
    });
    expect(stale.applied).toBe(false);
    expect((await row(o.id)).status).toBe("ON_GOING");
  });
});

describe("transitionDeliveryOrder side effects", () => {
  it.each(["FAILED", "EXPIRED", "CANCELLED"] as const)(
    "%s enqueues a refund with the given reason",
    async (to) => {
      const user = await createUser("u");
      const o = await order(user, { status: "ASSIGNING_DRIVER" });
      await transitionDeliveryOrder(dbPool, { id: o.id }, to, {
        source: "user",
        payload: {},
        refundReason: "WHY",
      });
      expect(enqueueDeliveryRefund).toHaveBeenCalledWith({ deliveryOrderId: o.id, reason: "WHY" });
    },
  );

  it("keeps the move when the refund enqueue fails, and the sweep picks the order up", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ASSIGNING_DRIVER" });
    (enqueueDeliveryRefund as jest.Mock).mockRejectedValueOnce(new Error("redis down"));
    jest.spyOn(console, "error").mockImplementationOnce(() => {});

    const result = await transitionDeliveryOrder(dbPool, { id: o.id }, "CANCELLED", { source: "user", payload: {} });

    expect(result.applied).toBe(true);
    expect(await row(o.id)).toMatchObject({ status: "CANCELLED", payment_status: "PAID" });
    await ageOrder(o.id);
    expect(await listOrdersOwedRefund(dbPool, 10)).toContain(o.id);
  });

  it("rolls the status back when a later write in the move fails", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ASSIGNING_DRIVER" });
    await expect(
      transitionDeliveryOrder(dbPool, { id: o.id }, "CANCELLED", {
        source: "user",
        payload: {},
        eventId: "x".repeat(101), // longer than event_id varchar(100): the event INSERT fails
      }),
    ).rejects.toThrow();

    expect((await row(o.id)).status).toBe("ASSIGNING_DRIVER");
    expect(await events(o.id)).toEqual([]);
    expect(enqueueDeliveryRefund).not.toHaveBeenCalled();
  });

  it("does not refund a non-terminal move", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ASSIGNING_DRIVER" });
    await transitionDeliveryOrder(dbPool, { id: o.id }, "ON_GOING", { source: "sandbox", payload: {} });
    expect(enqueueDeliveryRefund).not.toHaveBeenCalled();
  });

  it("closing the payment window cancels the still-pending payment", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "PAYMENT_PENDING", paymentStatus: "PENDING", lalamoveOrderId: null });
    await transitionDeliveryOrder(dbPool, { id: o.id }, "EXPIRED", {
      source: "background_reconciliation_worker",
      expectedFrom: "PAYMENT_PENDING",
      failureReason: "Payment not completed within payment window",
      payload: {},
    });
    expect(await row(o.id)).toMatchObject({
      status: "EXPIRED",
      payment_status: "CANCELLED",
      failure_reason: "Payment not completed within payment window",
    });
  });

  it("leaves a paid payment alone (the refund worker handles it)", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ASSIGNING_DRIVER" });
    await transitionDeliveryOrder(dbPool, { id: o.id }, "CANCELLED", { source: "user", payload: {} });
    expect((await row(o.id)).payment_status).toBe("PAID");
  });

  it("pushes delivery_update to both the Lalamove id and the local id rooms", async () => {
    const user = await createUser("u");
    const o = await order(user, { status: "ON_GOING" });
    await transitionDeliveryOrder(dbPool, { id: o.id }, "PICKED_UP", { source: "sandbox", payload: {}, io });
    expect(emits.map((e) => e.room).sort()).toEqual(
      [`delivery_${o.id}`, `delivery_${o.lalamoveOrderId}`].sort(),
    );
    expect(emits.every((e) => e.payload.status === "PICKED_UP")).toBe(true);
  });
});

describe("listOrdersOwedRefund (the reconcile sweep)", () => {
  it("lists paid FAILED and EXPIRED orders and paid CANCELLED orders this module marked", async () => {
    const user = await createUser("u");
    const failed = await order(user, { status: "FAILED" }); // e.g. written by PaymentService's saga
    const expired = await order(user, { status: "EXPIRED" });
    const cancelled = await order(user, { status: "ASSIGNING_DRIVER" });
    await transitionDeliveryOrder(dbPool, { id: cancelled.id }, "CANCELLED", { source: "user", payload: {} });
    for (const o of [failed, expired, cancelled]) await ageOrder(o.id);

    expect(await listOrdersOwedRefund(dbPool, 10)).toEqual(
      expect.arrayContaining([failed.id, expired.id, cancelled.id]),
    );
  });

  it("never lists a CANCELLED order from before cancels were refunded", async () => {
    const user = await createUser("u");
    const legacy = await order(user, { status: "CANCELLED" }); // refund_due_at NULL
    await ageOrder(legacy.id);
    expect(await listOrdersOwedRefund(dbPool, 10)).not.toContain(legacy.id);
  });

  it("skips unpaid orders, live orders and orders still inside the grace period", async () => {
    const user = await createUser("u");
    const unpaid = await order(user, { status: "PAYMENT_PENDING", paymentStatus: "PENDING", lalamoveOrderId: null });
    await transitionDeliveryOrder(dbPool, { id: unpaid.id }, "EXPIRED", { source: "sandbox", payload: {} });
    const live = await order(user, { status: "ON_GOING" });
    const fresh = await order(user, { status: "FAILED" });
    await ageOrder(unpaid.id);
    await ageOrder(live.id);

    const owed = await listOrdersOwedRefund(dbPool, 10);
    expect(owed).not.toContain(unpaid.id);
    expect(owed).not.toContain(live.id);
    expect(owed).not.toContain(fresh.id);
  });
});

describe("who may see an order (ADR 0001)", () => {
  async function shareWithWeave() {
    const giver = await createUser("giver"); // Post Author of a Share
    const receiver = await createUser("receiver");
    const stranger = await createUser("stranger");
    const post = await createPost(giver, { type: "share" });
    const weaveId = await insert(
      "INSERT INTO weaves (post_id, giver_id, receiver_id, status) VALUES (?, ?, ?, 'approved')",
      [post.id, giver.id, receiver.id],
    );
    return { giver, receiver, stranger, post, weaveId };
  }
  const see = (orderId: number, user: TestUser, role = "user") =>
    deliveryAccessFor(dbPool, String(orderId), { userId: user.id, role });

  it("lets both Weave parties see an order the Giver placed; nobody else", async () => {
    const w = await shareWithWeave();
    const o = await order(w.giver, { postId: w.post.id, weaveId: w.weaveId });
    await expect(see(o.id, w.giver)).resolves.toBe(true);
    await expect(see(o.id, w.receiver)).resolves.toBe(true);
    await expect(see(o.id, w.stranger)).resolves.toBe(false);
    await expect(see(o.id, w.stranger, "admin")).resolves.toBe(true);
  });

  it("keeps the old orderer-or-post-author rule for an order with no linked Weave", async () => {
    const w = await shareWithWeave();
    const o = await order(w.giver, { postId: w.post.id, weaveId: null });
    await expect(see(o.id, w.giver)).resolves.toBe(true);
    await expect(see(o.id, w.receiver)).resolves.toBe(false);
  });

  it("answers null for an unknown order", async () => {
    const w = await shareWithWeave();
    await expect(see(987654, w.giver)).resolves.toBeNull();
  });
});

describe("weave_id backfill (migration 20261123055113)", () => {
  const migration = readFileSync(
    path.resolve(__dirname, "../../../db/migrations/20261123055113_delivery_orders_weave_id.sql"),
    "utf8",
  );
  const backfill = migration.slice(migration.indexOf("UPDATE `delivery_orders`"), migration.indexOf("-- migrate:down")).trim();

  it("links an old order only when exactly one Approved or Completed Weave has the orderer as a party", async () => {
    const giver = await createUser("giver");
    const receiver = await createUser("receiver");
    const other = await createUser("other");
    const single = await createPost(giver, { type: "share" });
    const weaveId = await insert(
      "INSERT INTO weaves (post_id, giver_id, receiver_id, status) VALUES (?, ?, ?, 'completed')",
      [single.id, giver.id, receiver.id],
    );
    await insert("INSERT INTO weaves (post_id, giver_id, receiver_id, status) VALUES (?, ?, ?, 'declined')", [
      single.id,
      giver.id,
      other.id,
    ]);
    const ambiguous = await createPost(giver, { type: "share" });
    for (const r of [receiver, other]) {
      await insert("INSERT INTO weaves (post_id, giver_id, receiver_id, status) VALUES (?, ?, ?, 'approved')", [
        ambiguous.id,
        giver.id,
        r.id,
      ]);
    }
    const linked = await order(receiver, { postId: single.id });
    const unlinked = await order(giver, { postId: ambiguous.id });

    await dbPool.query(backfill);

    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id, weave_id FROM delivery_orders WHERE id IN (?, ?) ORDER BY id",
      [linked.id, unlinked.id],
    );
    expect(rows.map((r) => (r.weave_id == null ? null : Number(r.weave_id)))).toEqual([weaveId, null]);
  });
});
