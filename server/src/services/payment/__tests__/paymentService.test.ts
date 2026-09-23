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
  let mockLalamoveService: { createLalamoveOrder: jest.Mock };
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
    };

    paymentService = new PaymentService({
      dbPool: mockPool as unknown as Pool,
      provider: mockProvider,
      lalamoveService: mockLalamoveService,
    });
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

  describe("handlePaymentCallback (Idempotency & Dispatch)", () => {
    it("should process payment and dispatch Lalamove when callback is valid and status is PENDING", async () => {
      const parsedCallback: ParsedCallbackResult = {
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

      mockProvider.verifyAndParseCallback.mockResolvedValue(parsedCallback);

      // UPDATE payments returns affectedRows: 1 (Atomic gate success)
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // SELECT delivery order
      mockConnection.query.mockResolvedValueOnce([
        [
          {
            id: 201,
            user_id: 42,
            payment_id: 101,
            quotation_id: "QUOTE_12345",
            service_type: "MOTORCYCLE",
            sender_name: "Alice",
            sender_phone: "+886912345678",
            recipient_name: "Bob",
            recipientPhone: "+886987654321",
            version: 0,
          },
        ],
      ]);

      // Lalamove dispatch success
      mockLalamoveService.createLalamoveOrder.mockResolvedValue({
        orderId: "LALA_ORDER_888",
        shareLink: "https://lalamove.com/track/888",
        driverDetails: {
          name: "John Driver",
          phone: "+886900000000",
          plateNumber: "ABC-1234",
        },
      });

      // Update delivery_orders & insert events
      mockPool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE delivery_orders
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT delivery_order_events

      const result = await paymentService.handlePaymentCallback({
        MerchantTradeNo: "MW1234567890",
      });

      expect(result.status).toBe("PROCESSED");
      expect(mockLalamoveService.createLalamoveOrder).toHaveBeenCalled();
    });

    it("should ignore duplicate callback if affectedRows === 0 (Idempotency Gate)", async () => {
      const parsedCallback: ParsedCallbackResult = {
        isValid: true,
        isSuccess: true,
        merchantTradeNo: "MW_ALREADY_PAID",
        tradeNo: "ECPAY_TRADE_999",
        amount: 150,
        rtnCode: 1,
        rtnMsg: "Succeeded",
        simulatedPaid: false,
        rawPayload: {},
      };

      mockProvider.verifyAndParseCallback.mockResolvedValue(parsedCallback);

      // UPDATE payments returns affectedRows: 0 (Already processed or not PENDING)
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const result = await paymentService.handlePaymentCallback({
        MerchantTradeNo: "MW_ALREADY_PAID",
      });

      expect(result.status).toBe("IGNORED");
      expect(mockLalamoveService.createLalamoveOrder).not.toHaveBeenCalled();
    });

    it("should trigger refund if Lalamove dispatch fails after payment", async () => {
      const parsedCallback: ParsedCallbackResult = {
        isValid: true,
        isSuccess: true,
        merchantTradeNo: "MW1234567890",
        tradeNo: "ECPAY_TRADE_999",
        amount: 150,
        rtnCode: 1,
        rtnMsg: "Succeeded",
        simulatedPaid: false,
        rawPayload: {},
      };

      mockProvider.verifyAndParseCallback.mockResolvedValue(parsedCallback);

      // UPDATE payments returns affectedRows: 1
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      // SELECT delivery order & payments
      mockConnection.query.mockResolvedValueOnce([
        [
          {
            id: 201,
            payment_id: 101,
            quotation_id: "QUOTE_12345",
            version: 0,
          },
        ],
      ]);

      // Lalamove dispatch fails (e.g. quote expired)
      mockLalamoveService.createLalamoveOrder.mockRejectedValue(
        new Error("ERR_QUOTATION_EXPIRED"),
      );

      // Mock queries in handlePaymentCallback on failure:
      // 1. UPDATE delivery_orders status = 'FAILED'
      // 2. INSERT delivery_order_events status = 'FAILED'
      // 3. (in refund) SELECT payments
      // 4. (in refund) SELECT payment_refunds
      // 5. (in refund) INSERT payment_refunds
      // 6. (in refund) UPDATE payments status = 'REFUNDED'
      mockPool.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // 1. UPDATE delivery_orders
        .mockResolvedValueOnce([{ insertId: 1 }]) // 2. INSERT delivery_order_events
        .mockResolvedValueOnce([
          [
            {
              id: 101,
              merchant_trade_no: "MW1234567890",
              trade_no: "ECPAY_TRADE_999",
              amount: 150,
              status: "PAID",
            },
          ],
        ]) // 3. SELECT payments
        .mockResolvedValueOnce([[{ total_refunded: 0 }]]) // 4. SELECT sum refunds
        .mockResolvedValueOnce([{ insertId: 1 }]) // 5. INSERT payment_refunds
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // 6. UPDATE payments

      mockProvider.refundPayment.mockResolvedValue({
        isSuccess: true,
        rtnCode: 1,
      });

      const result = await paymentService.handlePaymentCallback({
        MerchantTradeNo: "MW1234567890",
      });

      expect(result.status).toBe("PROCESSED");
      expect(mockProvider.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantTradeNo: "MW1234567890",
          tradeNo: "ECPAY_TRADE_999",
          amount: 150,
        }),
      );
    });
  });
});
