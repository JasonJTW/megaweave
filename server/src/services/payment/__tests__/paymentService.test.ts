import { PaymentService, CreateCheckoutOrderInput } from "../paymentService";
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

    paymentService = new PaymentService({
      dbPool: mockPool as unknown as Pool,
      provider: mockProvider,
      lalamoveService: mockLalamoveService,
      enqueueDeliveryRefund: mockEnqueueRefund,
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

  describe("handlePaymentCallback (Idempotency & Dispatch saga)", () => {
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

    /** T1：閘門 PAID → 查外送單 → ORDER_PLACING（placingAffected=0 代表外送單已關閉） */
    const mockT1 = (row = order(), placingAffected = 1) => {
      mockConnection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[row]])
        .mockResolvedValueOnce([{ affectedRows: placingAffected }]);
    };

    const sqls = () => mockPool.query.mock.calls.map((c) => c[0] as string);
    const callback = () =>
      paymentService.handlePaymentCallback({ MerchantTradeNo: "MW1234567890" });

    beforeEach(() => {
      mockProvider.verifyAndParseCallback.mockResolvedValue(successCallback);
    });

    it("dispatches to Lalamove with deliveryOrderId metadata and records ASSIGNING_DRIVER", async () => {
      mockT1();
      mockLalamoveService.createLalamoveOrder.mockResolvedValue({
        orderId: "LALA_ORDER_888",
        shareLink: "https://lalamove.com/track/888",
      });
      mockPool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // T3 UPDATE → ASSIGNING_DRIVER
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT event

      const result = await callback();

      expect(result.status).toBe("PROCESSED");
      expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          quotationId: "QUOTE_12345",
          metadata: { deliveryOrderId: "201" },
        }),
      );
      expect(mockPool.query.mock.calls[0][1][0]).toBe("LALA_ORDER_888");
      expect(mockEnqueueRefund).not.toHaveBeenCalled();
    });

    it("ignores a duplicate callback when the gate matches no row", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const result = await callback();

      expect(result.status).toBe("IGNORED");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });

    it("lets CANCELLED / FAILED payments pass the gate so late money is never silently ignored", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await callback();

      expect(mockConnection.query.mock.calls[0][0]).toContain(
        "status IN ('PENDING', 'FAILED', 'CANCELLED')",
      );
    });

    it("enqueues a refund without dispatching when the delivery order already closed (late payment)", async () => {
      mockT1(order(), 0);

      const result = await callback();

      expect(result.status).toBe("PROCESSED");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
      expect(mockEnqueueRefund).toHaveBeenCalledWith({
        deliveryOrderId: 201,
        reason: "PAID_AFTER_ORDER_CLOSED",
      });
    });

    describe("T2 (pivot) failure → compensate", () => {
      it("marks FAILED and enqueues a refund when Lalamove order creation fails", async () => {
        mockT1();
        mockLalamoveService.createLalamoveOrder.mockRejectedValue(new Error("ERR_QUOTATION_EXPIRED"));
        mockPool.query
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE → FAILED
          .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT event

        const result = await callback();

        expect(result.status).toBe("PROCESSED");
        expect(sqls()[0]).toContain("status = 'FAILED'");
        expect(mockPool.query.mock.calls[0][1]).toEqual(["ERR_QUOTATION_EXPIRED", 201]);
        expect(mockEnqueueRefund).toHaveBeenCalledWith({
          deliveryOrderId: 201,
          reason: "LALAMOVE_DISPATCH_FAILED",
        });
        expect(mockProvider.refundPayment).not.toHaveBeenCalled();
      });

      it("does not compensate twice when the order already left ORDER_PLACING", async () => {
        mockT1();
        mockLalamoveService.createLalamoveOrder.mockRejectedValue(new Error("timeout"));
        mockPool.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // reconcile already FAILED it

        await callback();

        expect(mockEnqueueRefund).not.toHaveBeenCalled();
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
        mockT1();
        mockPool.query
          .mockRejectedValueOnce(new Error("ECONNRESET"))
          .mockResolvedValueOnce([{ affectedRows: 1 }])
          .mockResolvedValueOnce([{ insertId: 1 }]);

        await callback();

        expect(sqls().filter((q) => q.includes("ASSIGNING_DRIVER")).length).toBeGreaterThanOrEqual(2);
        expect(sqls().some((q) => q.includes("status = 'FAILED'"))).toBe(false);
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });

      it("leaves ORDER_PLACING for webhook adoption when every retry fails (car already dispatched)", async () => {
        mockT1();
        mockPool.query.mockRejectedValue(new Error("DB down"));

        const result = await callback();

        expect(result.status).toBe("PROCESSED");
        expect(sqls().some((q) => q.includes("status = 'FAILED'"))).toBe(false);
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
        expect(mockLalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
      });

      it("does nothing when a webhook already adopted the same Lalamove order", async () => {
        mockT1();
        mockPool.query
          .mockResolvedValueOnce([{ affectedRows: 0 }]) // T3 guard miss
          .mockResolvedValueOnce([[{ status: "ASSIGNING_DRIVER", lalamove_order_id: "LALA_1" }]]);

        await callback();

        expect(mockLalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
      });

      it("cancels the Lalamove order when reconcile already failed + refunded the delivery order", async () => {
        mockT1();
        mockPool.query
          .mockResolvedValueOnce([{ affectedRows: 0 }]) // T3 guard miss
          .mockResolvedValueOnce([[{ status: "FAILED", lalamove_order_id: null }]])
          .mockResolvedValueOnce([{ affectedRows: 1 }]); // link orphan orderId

        await callback();

        expect(mockLalamoveService.cancelLalamoveOrder).toHaveBeenCalledWith("LALA_1");
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });
    });

    describe("expired quotation at payment time → re-quote", () => {
      const expired = () => order({ quotation_id: "OLD_QUOTE", expires_at: new Date(Date.now() - 60 * 1000) });
      const locationRows = [
        { id: 1, lat: "25.0478", lng: "121.5170" },
        { id: 2, lat: "25.0339", lng: "121.5644" },
      ];
      const quote = (total: string) => ({
        quotationId: "NEW_QUOTE",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        priceBreakdown: { total },
      });

      it("dispatches with the new quotation when the new fee <= paid", async () => {
        mockT1(expired());
        mockPool.query
          .mockResolvedValueOnce([locationRows])
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE quotation_id (before T2)
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // T3
          .mockResolvedValueOnce([{ insertId: 1 }]);
        mockLalamoveService.requestLalamoveQuotation.mockResolvedValue(quote("140"));
        mockLalamoveService.createLalamoveOrder.mockResolvedValue({ orderId: "LALA_1" });

        const result = await callback();

        expect(result.status).toBe("PROCESSED");
        expect(mockLalamoveService.requestLalamoveQuotation).toHaveBeenCalledWith(
          expect.objectContaining({
            serviceType: "MOTORCYCLE",
            stops: [
              expect.objectContaining({ address: "Taipei Main Station" }),
              expect.objectContaining({ address: "Taipei 101" }),
            ],
          }),
        );
        expect(mockPool.query.mock.calls[1][1]).toEqual(["NEW_QUOTE", expect.any(Date), 201]);
        expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalledWith(
          expect.objectContaining({ quotationId: "NEW_QUOTE" }),
        );
        expect(mockEnqueueRefund).not.toHaveBeenCalled();
      });

      it("marks FAILED and enqueues a refund when the re-quoted fee exceeds the paid amount", async () => {
        mockT1(expired());
        mockPool.query
          .mockResolvedValueOnce([locationRows])
          .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE → FAILED
          .mockResolvedValueOnce([{ insertId: 1 }]);
        mockLalamoveService.requestLalamoveQuotation.mockResolvedValue(quote("180"));

        await callback();

        expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
        expect(mockPool.query.mock.calls[1][1][0]).toMatch(/exceeds paid amount/);
        expect(mockEnqueueRefund).toHaveBeenCalledWith({
          deliveryOrderId: 201,
          reason: "LALAMOVE_DISPATCH_FAILED",
        });
      });
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
