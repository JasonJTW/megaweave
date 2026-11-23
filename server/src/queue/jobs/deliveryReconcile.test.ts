import dbPool from "../../utils/db";
import { getLalamoveOrderDetail } from "../../services/lalamove";
import {
  processDeliveryReconciliation,
  PAYMENT_WINDOW_MINUTES,
  UNDISPATCHED_GRACE_MINUTES,
} from "./deliveryReconcile";
import type { PaymentService } from "../../services/payment/paymentService";
import { enqueueDeliveryRefund } from "../queues";
import { transitionDeliveryOrder } from "../../services/delivery";

jest.mock("../../utils/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock("../../services/lalamove", () => ({
  getLalamoveOrderDetail: jest.fn(),
}));
jest.mock("../../lalamove", () => ({
  mapLalamoveStatusToDbStatus: (s: string) => s,
}));
jest.mock("../../utils/socket", () => ({ getSocketBroadcaster: () => null }));
//* 守衛、稽核、付款連動與退款在 DeliveryOrder module（delivery.db.test.ts）；這裡驗對帳怎麼呼叫它
jest.mock("../../services/delivery", () => ({
  ...jest.requireActual("../../services/delivery"),
  transitionDeliveryOrder: jest.fn(),
}));
const transition = transitionDeliveryOrder as jest.Mock;
jest.mock("../../services/payment/defaultPaymentService", () => ({
  createPaymentService: jest.fn(),
}));
jest.mock("../queues", () => ({
  enqueueDeliveryRefund: jest.fn().mockResolvedValue(undefined),
}));

const query = dbPool.query as jest.Mock;

function staleRow(status: string) {
  return {
    id: 1,
    lalamove_order_id: "L1",
    status,
    driver_name: "Driver",
    updated_at: new Date(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  query.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("Phase 0: interrupted dispatch saga (backstop) + refund sweep", () => {
  const checkPlacingOrder = jest.fn();
  const service = () => ({ checkPlacingOrder }) as unknown as PaymentService;

  beforeEach(() => checkPlacingOrder.mockReset());

  it("hands never-dispatched and outcome-unknown ORDER_PLACING orders to checkPlacingOrder", async () => {
    query
      .mockResolvedValueOnce([[{ id: 5 }, { id: 6 }]]) // stuck scan
      .mockResolvedValueOnce([[]]) // refund sweep
      .mockResolvedValueOnce([[]]) // Phase 1
      .mockResolvedValueOnce([[]]); // Phase 2
    checkPlacingOrder.mockResolvedValueOnce("DISPATCHED").mockResolvedValueOnce("FAILED");

    const result = await processDeliveryReconciliation(undefined, service);

    const [scanSql, scanParams] = query.mock.calls[0];
    expect(scanSql).toContain("status = 'ORDER_PLACING'");
    expect(scanSql).toContain("dispatch_attempted_at IS NULL");
    expect(scanParams).toEqual([UNDISPATCHED_GRACE_MINUTES, 5]);
    expect(checkPlacingOrder).toHaveBeenNthCalledWith(1, 5);
    expect(checkPlacingOrder).toHaveBeenNthCalledWith(2, 6);
    expect(result.stuckPlacingCount).toBe(2);
  });

  it("keeps going when one order fails to recover", async () => {
    query
      .mockResolvedValueOnce([[{ id: 5 }, { id: 6 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    checkPlacingOrder.mockRejectedValueOnce(new Error("Lalamove down")).mockResolvedValueOnce("NOOP");

    const result = await processDeliveryReconciliation(undefined, service);

    expect(checkPlacingOrder).toHaveBeenCalledTimes(2);
    expect(result.stuckPlacingCount).toBe(0);
  });

  it("re-enqueues refunds for terminated orders whose payment is still PAID", async () => {
    query
      .mockResolvedValueOnce([[]]) // stuck scan
      .mockResolvedValueOnce([[{ id: 8 }]]) // refund sweep
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await processDeliveryReconciliation(undefined, service);

    const [sweepSql, sweepParams] = query.mock.calls[1];
    expect(sweepSql).toContain("p.status = 'PAID'");
    expect(sweepParams[0]).toEqual(["FAILED", "EXPIRED"]);
    expect(enqueueDeliveryRefund).toHaveBeenCalledWith({ deliveryOrderId: 8, reason: "REFUND_SWEEP" });
  });
});

describe("Phase 1: expire PAYMENT_PENDING", () => {
  beforeEach(() => query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])); // Phase 0

  it("expires by payment window (created_at), not by quotation expires_at", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    await processDeliveryReconciliation();

    const [sql, params] = query.mock.calls[2];
    expect(sql).toContain("created_at < NOW() - INTERVAL ? MINUTE");
    expect(sql).not.toContain("expires_at");
    expect(params).toEqual([PAYMENT_WINDOW_MINUTES]);
  });

  it("expires only from PAYMENT_PENDING and counts only what the module applied", async () => {
    query
      .mockResolvedValueOnce([[{ delivery_order_id: 9, payment_id: 3 }, { delivery_order_id: 10, payment_id: 4 }]])
      .mockResolvedValueOnce([[]]); // Phase 2 scan
    transition.mockResolvedValueOnce({ applied: false }).mockResolvedValueOnce({ applied: true });

    const result = await processDeliveryReconciliation();

    expect(transition).toHaveBeenCalledWith(
      dbPool,
      { id: 9 },
      "EXPIRED",
      expect.objectContaining({ expectedFrom: "PAYMENT_PENDING" }),
    );
    expect(result.expiredCount).toBe(1);
  });
});

describe("Phase 2: reconcile in-progress orders", () => {
  beforeEach(() => query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])); // Phase 0

  it("applies a valid transition with CAS on the scanned status", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[staleRow("ON_GOING")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "PICKED_UP" });
    transition.mockResolvedValueOnce({ applied: true });

    const result = await processDeliveryReconciliation();

    expect(transition).toHaveBeenCalledWith(
      dbPool,
      { id: 1 },
      "PICKED_UP",
      expect.objectContaining({ expectedFrom: "ON_GOING", failureReason: null }),
    );
    expect(result.reconciledCount).toBe(1);
  });

  it("does not regress status on an invalid transition", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[staleRow("PICKED_UP")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "ON_GOING" });

    const result = await processDeliveryReconciliation();

    expect(transition).not.toHaveBeenCalled();
    expect(result.reconciledCount).toBe(0);
  });

  it("counts nothing when a webhook changed the row concurrently", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[staleRow("ON_GOING")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "PICKED_UP" });
    transition.mockResolvedValueOnce({ applied: false });

    const result = await processDeliveryReconciliation();

    expect(result.reconciledCount).toBe(0);
  });

  it("PICKED_UP -> ASSIGNING_DRIVER (driver rejected) is applied", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[staleRow("PICKED_UP")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "ASSIGNING_DRIVER" });
    transition.mockResolvedValueOnce({ applied: true });

    const result = await processDeliveryReconciliation();

    expect(transition).toHaveBeenCalledWith(dbPool, { id: 1 }, "ASSIGNING_DRIVER", expect.anything());
    expect(result.reconciledCount).toBe(1);
  });

  it("remote EXPIRED passes the Lalamove failure reason", async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[staleRow("ASSIGNING_DRIVER")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "EXPIRED" });
    transition.mockResolvedValueOnce({ applied: true });

    await processDeliveryReconciliation();

    expect(transition).toHaveBeenCalledWith(
      dbPool,
      { id: 1 },
      "EXPIRED",
      expect.objectContaining({ failureReason: "LALAMOVE_EXPIRED" }),
    );
  });
});
