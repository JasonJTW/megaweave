import { Pool } from "mysql2/promise";
import { adoptLalamoveOrder, cancelOrphanLalamoveOrder } from "./deliveryRecovery";

const query = jest.fn();
const db = { query } as unknown as Pool;
const cancel = jest.fn();
const params = { lalamoveOrderId: "L1", quotationId: "Q1", shareLink: "https://s" };
const sqls = () => query.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  query.mockReset();
  cancel.mockReset().mockResolvedValue({ success: true });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("adoptLalamoveOrder", () => {
  it("returns NOT_FOUND when no delivery order holds the quotation", async () => {
    query.mockResolvedValueOnce([[]]);
    await expect(adoptLalamoveOrder(db, cancel, params)).resolves.toEqual({
      result: "NOT_FOUND",
      deliveryOrderId: null,
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("adopts an ORDER_PLACING order whose orderId was never recorded", async () => {
    query
      .mockResolvedValueOnce([[{ id: 7, status: "ORDER_PLACING", lalamove_order_id: null }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{}]);

    const { result } = await adoptLalamoveOrder(db, cancel, params);

    expect(result).toBe("ADOPTED");
    const [sql, values] = query.mock.calls[1];
    expect(sql).toContain("status = 'ORDER_PLACING' AND lalamove_order_id IS NULL");
    expect(values).toEqual(["L1", "https://s", 7]);
    expect(sqls()[2]).toContain("INSERT INTO delivery_order_events");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("is a no-op when T3 already recorded the same order", async () => {
    query.mockResolvedValueOnce([[{ id: 7, status: "ASSIGNING_DRIVER", lalamove_order_id: "L1" }]]);
    const { result } = await adoptLalamoveOrder(db, cancel, params);
    expect(result).toBe("ALREADY_LINKED");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("cancels the Lalamove order when the delivery order already failed (timed out + refunded)", async () => {
    query
      .mockResolvedValueOnce([[{ id: 7, status: "FAILED", lalamove_order_id: null }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // link orphan orderId

    const { result } = await adoptLalamoveOrder(db, cancel, params);

    expect(result).toBe("ORPHAN_CANCELLED");
    expect(cancel).toHaveBeenCalledWith("L1");
  });

  it("cancels a duplicate Lalamove order when the delivery order is linked to another one", async () => {
    query
      .mockResolvedValueOnce([[{ id: 7, status: "ON_GOING", lalamove_order_id: "L0" }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    const { result } = await adoptLalamoveOrder(db, cancel, params);

    expect(result).toBe("ORPHAN_CANCELLED");
    expect(cancel).toHaveBeenCalledWith("L1");
  });

  it("re-reads after losing the adoption race", async () => {
    query
      .mockResolvedValueOnce([[{ id: 7, status: "ORDER_PLACING", lalamove_order_id: null }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // T3 won
      .mockResolvedValueOnce([[{ id: 7, status: "ASSIGNING_DRIVER", lalamove_order_id: "L1" }]]);

    const { result } = await adoptLalamoveOrder(db, cancel, params);

    expect(result).toBe("ALREADY_LINKED");
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("cancelOrphanLalamoveOrder", () => {
  it("returns false (and alerts) when cancellation fails", async () => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    cancel.mockRejectedValue(new Error("ERR_CANCELLATION_FORBIDDEN"));

    await expect(
      cancelOrphanLalamoveOrder(db, cancel, { deliveryOrderId: 7, lalamoveOrderId: "L1", reason: "x" }),
    ).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("manual action required"),
      expect.any(Error),
    );
  });
});
