import dbPool from "../../utils/db";
import { getLalamoveOrderDetail } from "../../services/lalamove";
import { processDeliveryReconciliation } from "./deliveryReconcile";
import { enqueueDeliveryRefund } from "../queues";

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
jest.mock("../../utils/socket", () => ({ getSocketIO: () => null }));
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

const sqls = () => query.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("Phase 1: expire PAYMENT_PENDING", () => {
  it("skips payment cancel + event when the order was paid concurrently", async () => {
    query
      .mockResolvedValueOnce([[{ delivery_order_id: 9, payment_id: 3 }]]) // expired scan
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // guarded EXPIRED update lost the race
      .mockResolvedValueOnce([[]]); // Phase 2 scan

    const result = await processDeliveryReconciliation();

    expect(result.expiredCount).toBe(0);
    expect(sqls().some((q) => q.includes("UPDATE payments"))).toBe(false);
    expect(sqls().some((q) => q.includes("delivery_order_events"))).toBe(false);
  });
});

describe("Phase 2: reconcile in-progress orders", () => {
  it("applies a valid transition with CAS on the scanned status", async () => {
    query
      .mockResolvedValueOnce([[]]) // Phase 1
      .mockResolvedValueOnce([[staleRow("ON_GOING")]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([{}]); // INSERT event
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "PICKED_UP" });

    const result = await processDeliveryReconciliation();

    const [sql, params] = query.mock.calls[2];
    expect(sql).toContain("WHERE id = ? AND status = ?");
    expect(params[0]).toBe("PICKED_UP");
    expect(params[params.length - 1]).toBe("ON_GOING");
    expect(result.reconciledCount).toBe(1);
  });

  it("does not regress status on an invalid transition", async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[staleRow("PICKED_UP")]]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "ON_GOING" });

    const result = await processDeliveryReconciliation();

    expect(sqls().some((q) => q.includes("UPDATE delivery_orders"))).toBe(false);
    expect(result.reconciledCount).toBe(0);
  });

  it("skips event + broadcast when a webhook changed the row concurrently", async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[staleRow("ON_GOING")]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "PICKED_UP" });

    const result = await processDeliveryReconciliation();

    expect(sqls().some((q) => q.includes("delivery_order_events"))).toBe(false);
    expect(result.reconciledCount).toBe(0);
  });

  it("PICKED_UP -> ASSIGNING_DRIVER (driver rejected) is applied", async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[staleRow("PICKED_UP")]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{}]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "ASSIGNING_DRIVER" });

    const result = await processDeliveryReconciliation();

    expect(query.mock.calls[2][1][0]).toBe("ASSIGNING_DRIVER");
    expect(result.reconciledCount).toBe(1);
    expect(enqueueDeliveryRefund).not.toHaveBeenCalled();
  });

  it("remote EXPIRED sets failure reason and enqueues refund", async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[staleRow("ASSIGNING_DRIVER")]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{}]);
    (getLalamoveOrderDetail as jest.Mock).mockResolvedValue({ status: "EXPIRED" });

    await processDeliveryReconciliation();

    expect(query.mock.calls[2][1][4]).toBe("LALAMOVE_EXPIRED");
    expect(enqueueDeliveryRefund).toHaveBeenCalledWith({
      deliveryOrderId: 1,
      reason: "LALAMOVE_EXPIRED",
    });
  });
});
