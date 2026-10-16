import {
  PaymentService,
  CreateCheckoutOrderInput,
  DISPATCH_CHECK_DELAY_MS,
} from "../paymentService";
import { LalamoveDispatchError } from "../../lalamoveErrors";
import { IPaymentProvider, ParsedCallbackResult } from "../types";
import { Pool } from "mysql2/promise";

interface MockConnection {
  query: jest.Mock;
  beginTransaction: jest.Mock;
  commit: jest.Mock;
  rollback: jest.Mock;
  release: jest.Mock;
}

interface MockPool {
  getConnection: jest.Mock;
  query: jest.Mock;
}

describe("PaymentService (Seam 3: Domain Orchestration & Idempotency)", () => {
  let mockProvider: jest.Mocked<IPaymentProvider>;
  let mockPool: MockPool;
  let mockConnection: MockConnection;
  let mockLalamoveService: {
    createLalamoveOrder: jest.Mock;
    requestLalamoveQuotation: jest.Mock;
    cancelLalamoveOrder: jest.Mock;
  };
  let mockEnqueueRefund: jest.Mock;
  let mockScheduleCheck: jest.Mock;
  let mockNotify: jest.Mock;
  let paymentService: PaymentService;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      query: jest.fn(),
    };

    mockProvider = {
      providerName: "MOCK_ECPAY",
      createPaymentSession: jest.fn().mockResolvedValue({
        provider: "MOCK_ECPAY",
        paymentMethod: "Credit",
        checkoutActionUrl: "https://payment.example.com",
        formData: { MerchantTradeNo: "MW12345" },
        htmlForm: "<form>Mock</form>",
      }),
      verifyAndParseCallback: jest.fn(),
      queryPayment: jest.fn(),
      refundPayment: jest.fn(),
    };

    mockLalamoveService = {
      createLalamoveOrder: jest.fn(),
      requestLalamoveQuotation: jest.fn(),
      cancelLalamoveOrder: jest.fn().mockResolvedValue({ success: true }),
    };
    mockEnqueueRefund = jest.fn().mockResolvedValue(undefined);
    mockScheduleCheck = jest.fn().mockResolvedValue(undefined);
    mockNotify = jest.fn().mockResolvedValue(undefined);

    paymentService = new PaymentService({
      dbPool: mockPool as unknown as Pool,
      provider: mockProvider,
      lalamoveService: mockLalamoveService,
      enqueueDeliveryRefund: mockEnqueueRefund,
      scheduleDispatchCheck: mockScheduleCheck,
      notifyDeliveryUser: mockNotify,
    });

    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("createCheckoutOrder", () => {
    it("should insert payments and delivery_orders atomically within a transaction", async () => {
      // Mock locations lookup
      mockPool.query
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              full_address: "Taipei Main Station",
              lat: "25.0478",
              lng: "121.5170",
            },
          ],
        ]) // pickup
        .mockResolvedValueOnce([
          [
            {
              id: 2,
              full_address: "Taipei 101",
              lat: "25.0339",
              lng: "121.5644",
            },
          ],
        ]); // dropoff

      // Mock insert payment & delivery_order
      mockConnection.query
        .mockResolvedValueOnce([[{ id: 7 }]]) // pending weave lookup
        .mockResolvedValueOnce([{ insertId: 101 }]) // payments insert
        .mockResolvedValueOnce([{ insertId: 201 }]); // delivery_orders insert

      const input: CreateCheckoutOrderInput = {
        userId: 42,
        postId: 99,
        serviceType: "MOTORCYCLE",
        quotationId: "QUOTE_12345",
        feeTotal: 150,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins in future
        pickupLocationId: 1,
        dropoffLocationId: 2,
        senderName: "Alice",
        senderPhone: "+886912345678",
        recipientName: "Bob",
        recipientPhone: "+886987654321",
      };

      const result = await paymentService.createCheckoutOrder(input);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockProvider.createPaymentSession).toHaveBeenCalled();
      expect(result.formData.MerchantTradeNo).toBeDefined();
      expect(result.htmlForm).toContain("<form>Mock</form>");
    });

    it("should reject checkout and roll back when the user has no pending weave for the post", async () => {
      mockPool.query
        .mockResolvedValueOnce([[{ id: 1, full_address: "Taipei Main Station" }]]) // pickup
        .mockResolvedValueOnce([[{ id: 2, full_address: "Taipei 101" }]]); // dropoff
      mockConnection.query.mockResolvedValueOnce([[]]); // pending weave lookup → none

      const input: CreateCheckoutOrderInput = {
        userId: 42,
        postId: 99,
        serviceType: "MOTORCYCLE",
        quotationId: "QUOTE_12345",
        feeTotal: 150,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        pickupLocationId: 1,
        dropoffLocationId: 2,
        senderName: "Alice",
        senderPhone: "+886912345678",
        recipientName: "Bob",
        recipientPhone: "+886987654321",
      };

      await expect(paymentService.createCheckoutOrder(input)).rejects.toThrow(
        /pending weave/i,
      );
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining("FOR UPDATE"),
        [99, 42, 42],
      );
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockProvider.createPaymentSession).not.toHaveBeenCalled();
    });

    it("should reject checkout if quotation has already expired", async () => {
      const input: CreateCheckoutOrderInput = {
        userId: 42,
        postId: 99,
        serviceType: "MOTORCYCLE",
        quotationId: "EXPIRED_QUOTE",
        feeTotal: 150,
        expiresAt: new Date(Date.now() - 1000), // expired in past
        pickupLocationId: 1,
        dropoffLocationId: 2,
        senderName: "Alice",
        senderPhone: "+886912345678",
        recipientName: "Bob",
        recipientPhone: "+886987654321",
      };

      await expect(paymentService.createCheckoutOrder(input)).rejects.toThrow(
        /quotation has expired/i,
      );
      expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    });
  });

  /**
   * 依 SQL 片段回應 mockPool.query：同一片段可排多個結果（依序取用，最後一個重複使用）；
   * 結果為 Error 時拋出。未設定的 SQL 直接失敗，避免測試默默走錯路徑。
   */
  const routes: { match: string; results: unknown[] }[] = [];
  const onSql = (match: string, ...results: unknown[]) => routes.push({ match, results });
  const sqlCalls = (match: string) =>
    mockPool.query.mock.calls.filter((c) => (c[0] as string).includes(match));

  const SQL = {
    claim: "SET dispatch_attempted_at = NOW(3)",
    loadOrder: "SELECT * FROM delivery_orders WHERE id = ?",
    recordDispatch: "SET status = 'ASSIGNING_DRIVER'",
    event: "INSERT INTO delivery_order_events",
    fail: "SET status = 'FAILED'",
    conflictRead: "SELECT status, lalamove_order_id FROM delivery_orders",
    linkOrphan: "AND lalamove_order_id IS NULL",
    locations: "FROM locations",
    requote: "SET quotation_id = ?",
    checkRead: "TIMESTAMPDIFF",
  };

  const order = (overrides: Record<string, unknown> = {}) => ({
    id: 201,
    payment_id: 101,
    quotation_id: "QUOTE_12345",
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    fee_total: "150.00",
    service_type: "MOTORCYCLE",
    pickup_location_id: 1,
    pickup_address_snapshot: "Taipei Main Station",
    dropoff_location_id: 2,
    dropoff_address_snapshot: "Taipei 101",
    sender_name: "Alice",
    sender_phone: "+886912345678",
    recipient_name: "Bob",
    recipient_phone: "+886987654321",
    ...overrides,
  });

  /** claim 成功 + 載入外送單（dispatchDeliveryOrder 的前兩步） */
  const claimable = (row = order()) => {
    onSql(SQL.claim, [{ affectedRows: 1 }]);
    onSql(SQL.loadOrder, [[row]]);
  };

  beforeEach(() => {
    routes.length = 0;
    mockPool.query.mockImplementation(async (sql: string) => {
      const route = routes.find((r) => sql.includes(r.match));
      if (!route) throw new Error(`Unexpected SQL in test: ${sql}`);
      const result = route.results.length > 1 ? route.results.shift() : route.results[0];
      if (result instanceof Error) throw result;
      return result;
    });
  });

  describe("handlePaymentCallback (T1 gate)", () => {
    const successCallback: ParsedCallbackResult = {
      isValid: true,
      isSuccess: true,
      merchantTradeNo: "MW1234567890",
      tradeNo: "ECPAY_TRADE_999",
      amount: 150,
      paymentDate: new Date("2026-03-01T12:00:00Z"),
      paymentMethod: "Credit_CreditCard",
      rtnCode: 1,
      rtnMsg: "Succeeded",
      simulatedPaid: false,
      rawPayload: { TradeNo: "ECPAY_TRADE_999" },
    };

    /** T1：閘門 PAID → 查外送單 → ORDER_PLACING（placingAffected=0 代表外送單已關閉） */
    const mockT1 = (placingAffected = 1) => {
      mockConnection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 201 }]])
        .mockResolvedValueOnce([{ affectedRows: placingAffected }]);
    };

    const callback = () =>
      paymentService.handlePaymentCallback({ MerchantTradeNo: "MW1234567890" });

    beforeEach(() => {
      mockProvider.verifyAndParseCallback.mockResolvedValue(successCallback);
    });

    it("schedules the 60s dispatch check, then dispatches with deliveryOrderId metadata", async () => {
      mockT1();
      claimable();
      onSql(SQL.recordDispatch, [{ affectedRows: 1 }]);
      onSql(SQL.event, [{ insertId: 1 }]);
      mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_888" });

      const result = await callback();

      expect(result).toEqual({ status: "PROCESSED", message: "Payment processed; dispatch DISPATCHED" });
      expect(mockScheduleCheck).toHaveBeenCalledWith(201, DISPATCH_CHECK_DELAY_MS, "initial");
      expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalledWith(
        expect.objectContaining({ quotationId: "QUOTE_12345", metadata: { deliveryOrderId: "201" } }),
      );
      expect(sqlCalls(SQL.recordDispatch)[0][1][0]).toBe("LALA_888");
      expect(mockEnqueueRefund).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("still dispatches when scheduling the check fails (cron is the backstop)", async () => {
      mockT1();
      claimable();
      onSql(SQL.recordDispatch, [{ affectedRows: 1 }]);
      onSql(SQL.event, [{ insertId: 1 }]);
      mockScheduleCheck.mockRejectedValue(new Error("Redis down"));
      mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_888" });

      await callback();

      expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalled();
    });

    it("ignores a duplicate callback when the gate matches no row", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const result = await callback();

      expect(result.status).toBe("IGNORED");
      expect(mockScheduleCheck).not.toHaveBeenCalled();
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });

    it("lets CANCELLED / FAILED payments pass the gate so late money is never silently ignored", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await callback();

      expect(mockConnection.query.mock.calls[0][0]).toContain(
        "status IN ('PENDING', 'FAILED', 'CANCELLED')",
      );
    });

    it("notifies and refunds without dispatching when the delivery order already closed", async () => {
      mockT1(0);

      const result = await callback();

      expect(result.status).toBe("PROCESSED");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
      expect(mockScheduleCheck).not.toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(201, "PAID_AFTER_ORDER_CLOSED");
      expect(mockEnqueueRefund).toHaveBeenCalledWith({
        deliveryOrderId: 201,
        reason: "PAID_AFTER_ORDER_CLOSED",
      });
    });
  });

  describe("dispatchDeliveryOrder (claim → T2 → T3)", () => {
    const dispatch = () => paymentService.dispatchDeliveryOrder(201);

    it("does nothing when another dispatcher already claimed it (dispatch_attempted_at set)", async () => {
      onSql(SQL.claim, [{ affectedRows: 0 }]);

      await expect(dispatch()).resolves.toBe("NOT_CLAIMED");
      expect(sqlCalls(SQL.claim)[0][0]).toContain("dispatch_attempted_at IS NULL");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });

    describe("T2 failure", () => {
      it("Lalamove definitely rejected (4xx) → FAILED, notify, enqueue refund", async () => {
        claimable();
        onSql(SQL.fail, [{ affectedRows: 1 }]);
        onSql(SQL.event, [{ insertId: 1 }]);
        mockLalamoveService.createLalamoveOrder.mockRejectedValue(
          new LalamoveDispatchError("ERR_INVALID_QUOTATION_ID", "REJECTED", 422),
        );

        await expect(dispatch()).resolves.toBe("FAILED");

        expect(sqlCalls(SQL.fail)[0][1]).toEqual(["ERR_INVALID_QUOTATION_ID", 201]);
        expect(mockNotify).toHaveBeenCalledWith(201, "DISPATCH_FAILED");
        expect(mockEnqueueRefund).toHaveBeenCalledWith({
          deliveryOrderId: 201,
          reason: "LALAMOVE_DISPATCH_FAILED",
        });
        expect(mockProvider.refundPayment).not.toHaveBeenCalled();
      });

      it("outcome unknown (timeout / network / 5xx) → keep ORDER_PLACING, no refund, no notice", async () => {
        claimable();
        mockLalamoveService.createLalamoveOrder.mockRejectedValue(
          new LalamoveDispatchError("timed out", "UNKNOWN"),
        );

        await expect(dispatch()).resolves.toBe("UNKNOWN");

        expect(sqlCalls(SQL.fail)).toHaveLength(0);
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
        expect(mockNotify).not.toHaveBeenCalled();
      });

      it("does not compensate twice when the order already left ORDER_PLACING", async () => {
        claimable();
        onSql(SQL.fail, [{ affectedRows: 0 }]);
        mockLalamoveService.createLalamoveOrder.mockRejectedValue(
          new LalamoveDispatchError("rejected", "REJECTED", 400),
        );

        await dispatch();

        expect(mockEnqueueRefund).not.toHaveBeenCalled();
        expect(mockNotify).not.toHaveBeenCalled();
      });
    });

    describe("T3 (retryable) failure → retry, never refund", () => {
      beforeEach(() => {
        mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_1" });
        jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
          fn();
          return 0;
        }) as unknown as typeof setTimeout);
      });

      afterEach(() => {
        (global.setTimeout as unknown as jest.SpyInstance).mockRestore();
      });

      it("retries a transient DB error and records the dispatch", async () => {
        claimable();
        onSql(SQL.recordDispatch, new Error("ECONNRESET"), [{ affectedRows: 1 }]);
        onSql(SQL.event, [{ insertId: 1 }]);

        await expect(dispatch()).resolves.toBe("DISPATCHED");

        expect(sqlCalls(SQL.recordDispatch)).toHaveLength(2);
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });

      it("leaves ORDER_PLACING for webhook adoption when every retry fails (car already dispatched)", async () => {
        claimable();
        onSql(SQL.recordDispatch, new Error("DB down"));

        await expect(dispatch()).resolves.toBe("DISPATCHED");

        expect(sqlCalls(SQL.recordDispatch)).toHaveLength(4);
        expect(sqlCalls(SQL.fail)).toHaveLength(0);
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
        expect(mockLalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
      });

      it("does nothing when a webhook already adopted the same Lalamove order", async () => {
        claimable();
        onSql(SQL.recordDispatch, [{ affectedRows: 0 }]);
        onSql(SQL.conflictRead, [[{ status: "ASSIGNING_DRIVER", lalamove_order_id: "LALA_1" }]]);

        await dispatch();

        expect(mockLalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
      });

      it("cancels the Lalamove order when the delivery order was already failed and refunded", async () => {
        claimable();
        onSql(SQL.recordDispatch, [{ affectedRows: 0 }]);
        onSql(SQL.conflictRead, [[{ status: "FAILED", lalamove_order_id: null }]]);
        onSql(SQL.linkOrphan, [{ affectedRows: 1 }]);

        await dispatch();

        expect(mockLalamoveService.cancelLalamoveOrder).toHaveBeenCalledWith("LALA_1");
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });
    });

    describe("expired quotation → re-quote", () => {
      const expired = () =>
        order({ quotation_id: "OLD_QUOTE", expires_at: new Date(Date.now() - 60 * 1000) });
      const locationRows = [
        { id: 1, lat: "25.0478", lng: "121.5170" },
        { id: 2, lat: "25.0339", lng: "121.5644" },
      ];
      const quote = (total: string) => ({
        quotationId: "NEW_QUOTE",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        priceBreakdown: { total },
      });

      it("dispatches with the new quotation (saved before T2) when the new fee <= paid", async () => {
        claimable(expired());
        onSql(SQL.locations, [locationRows]);
        onSql(SQL.requote, [{ affectedRows: 1 }]);
        onSql(SQL.recordDispatch, [{ affectedRows: 1 }]);
        onSql(SQL.event, [{ insertId: 1 }]);
        mockLalamoveService.requestLalamoveQuotation.mockResolvedValue(quote("140"));
        mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_1" });

        await expect(dispatch()).resolves.toBe("DISPATCHED");

        expect(mockLalamoveService.requestLalamoveQuotation).toHaveBeenCalledWith(
          expect.objectContaining({
            serviceType: "MOTORCYCLE",
            stops: [
              expect.objectContaining({ address: "Taipei Main Station" }),
              expect.objectContaining({ address: "Taipei 101" }),
            ],
          }),
        );
        expect(sqlCalls(SQL.requote)[0][1]).toEqual(["NEW_QUOTE", expect.any(Date), 201]);
        expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalledWith(
          expect.objectContaining({ quotationId: "NEW_QUOTE" }),
        );
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });

      it("fails and refunds (no Lalamove order) when the re-quoted fee exceeds the paid amount", async () => {
        claimable(expired());
        onSql(SQL.locations, [locationRows]);
        onSql(SQL.fail, [{ affectedRows: 1 }]);
        onSql(SQL.event, [{ insertId: 1 }]);
        mockLalamoveService.requestLalamoveQuotation.mockResolvedValue(quote("180"));

        await expect(dispatch()).resolves.toBe("FAILED");

        expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
        expect(sqlCalls(SQL.fail)[0][1][0]).toMatch(/exceeds paid amount/);
        expect(mockEnqueueRefund).toHaveBeenCalledWith({
          deliveryOrderId: 201,
          reason: "LALAMOVE_DISPATCH_FAILED",
        });
      });
    });
  });

  describe("checkPlacingOrder (60s check job / reconcile backstop)", () => {
    const check = () => paymentService.checkPlacingOrder(201);
    const placing = (dispatchAttemptedAt: Date | null, waitRemainingMs: number | null) =>
      onSql(SQL.checkRead, [
        [{ status: "ORDER_PLACING", dispatch_attempted_at: dispatchAttemptedAt, wait_remaining_ms: waitRemainingMs }],
      ]);

    it("is a no-op once the order left ORDER_PLACING", async () => {
      onSql(SQL.checkRead, [[{ status: "ASSIGNING_DRIVER", dispatch_attempted_at: new Date() }]]);

      await expect(check()).resolves.toBe("NOOP");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });

    it("re-dispatches when T2 was never sent (crash between T1 commit and T2)", async () => {
      placing(null, null);
      claimable();
      onSql(SQL.recordDispatch, [{ affectedRows: 1 }]);
      onSql(SQL.event, [{ insertId: 1 }]);
      mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_1" });

      await expect(check()).resolves.toBe("DISPATCHED");
      expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalledTimes(1);
    });

    it("waits for webhook adoption while the 5-minute window is open", async () => {
      placing(new Date(), 120_000);

      await expect(check()).resolves.toBe("WAITING");

      expect(mockScheduleCheck).toHaveBeenCalledWith(201, 121_000, "final");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
      expect(mockEnqueueRefund).not.toHaveBeenCalled();
    });

    it("fails, notifies and refunds once the window closes without a Lalamove order", async () => {
      placing(new Date(Date.now() - 6 * 60 * 1000), -60_000);
      onSql(SQL.fail, [{ affectedRows: 1 }]);
      onSql(SQL.event, [{ insertId: 1 }]);

      await expect(check()).resolves.toBe("FAILED");

      expect(sqlCalls(SQL.fail)[0][1]).toEqual(["DISPATCH_OUTCOME_UNKNOWN", 201]);
      expect(mockNotify).toHaveBeenCalledWith(201, "DISPATCH_FAILED");
      expect(mockEnqueueRefund).toHaveBeenCalledWith({
        deliveryOrderId: 201,
        reason: "LALAMOVE_DISPATCH_FAILED",
      });
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });
  });

  describe("refund (idempotent, retryable)", () => {
    const paidPayment = {
      id: 101,
      merchant_trade_no: "MW1234567890",
      trade_no: "ECPAY_TRADE_999",
      amount: 150,
      status: "PAID",
    };

    it("reserves a PENDING refund under a row lock, then marks it SUCCESS and the payment REFUNDED", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[paidPayment]]) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce([[{ total_refunded: 0, total_reserved: 0, refund_count: 0 }]])
        .mockResolvedValueOnce([{ insertId: 55 }]); // INSERT PENDING
      mockProvider.refundPayment.mockResolvedValue({ isSuccess: true, rtnCode: 1 });
      mockPool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE payment_refunds
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE payments

      await expect(paymentService.refund(101, "AUTO_REFUND: test")).resolves.toBe(true);

      expect(mockConnection.query.mock.calls[0][0]).toContain("FOR UPDATE");
      const [insertSql, insertParams] = mockConnection.query.mock.calls[2];
      expect(insertSql).toContain("'PENDING'");
      expect(insertParams[1]).toBe("RF101-1");
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockProvider.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({ tradeNo: "ECPAY_TRADE_999", amount: 150 }),
      );
      expect(mockPool.query.mock.calls[0][1]).toEqual(["SUCCESS", null, 55]);
      expect(mockPool.query.mock.calls[1][1]).toEqual(["REFUNDED", 101]);
    });

    it("refuses a second refund while the first is still PENDING (concurrent / retried call)", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[paidPayment]])
        .mockResolvedValueOnce([[{ total_refunded: 0, total_reserved: 150, refund_count: 1 }]]);

      await expect(paymentService.refund(101, "AUTO_REFUND: retry")).rejects.toThrow(
        /exceeds remaining refundable balance/,
      );
      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockProvider.refundPayment).not.toHaveBeenCalled();
    });

    it("refuses to refund a payment that is not PAID", async () => {
      mockConnection.query.mockResolvedValueOnce([[{ ...paidPayment, status: "CANCELLED" }]]);

      await expect(paymentService.refund(101, "x")).rejects.toThrow(/not refundable/);
      expect(mockProvider.refundPayment).not.toHaveBeenCalled();
    });

    it("keeps the refund PENDING when the provider outcome is unknown", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[paidPayment]])
        .mockResolvedValueOnce([[{ total_refunded: 0, total_reserved: 0, refund_count: 0 }]])
        .mockResolvedValueOnce([{ insertId: 55 }]);
      mockProvider.refundPayment.mockRejectedValue(new Error("The operation was aborted due to timeout"));

      await expect(paymentService.refund(101, "x")).rejects.toThrow(/timeout/);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });
});
