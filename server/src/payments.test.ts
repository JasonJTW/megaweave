import { createPaymentRouter } from "./payments";
import { PaymentService } from "./services/payment/paymentService";
import express, { Request, Response, NextFunction, RequestHandler } from "express";

interface RouterLayer {
  route?: {
    path: string;
    stack: Array<{ handle: RequestHandler }>;
  };
}

describe("Payment Routes (Seam 4: HTTP Endpoints & Webhook)", () => {
  let mockPaymentService: {
    createCheckoutOrder: jest.Mock;
    handlePaymentCallback: jest.Mock;
  };
  let router: express.Router;

  beforeEach(() => {
    mockPaymentService = {
      createCheckoutOrder: jest.fn(),
      handlePaymentCallback: jest.fn(),
    };

    router = createPaymentRouter({
      paymentService: mockPaymentService as unknown as PaymentService,
      authMiddleware: ((req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { user: { userId: number } }).user = { userId: 42 };
        next();
      }) as RequestHandler,
    });
  });

  describe("POST /checkout", () => {
    it("should validate input, invoke paymentService.createCheckoutOrder, and return session payload", async () => {
      mockPaymentService.createCheckoutOrder.mockResolvedValue({
        provider: "ECPAY_AIO",
        paymentMethod: "Credit",
        checkoutActionUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
        formData: { MerchantTradeNo: "MW12345" },
        htmlForm: "<form>...</form>",
      });

      // Mock dbPool.query so resolveLocationId returns a stable id
      // NOTE: jest.mock hoists to module scope, but since we use { locationId } (not address data),
      // resolveLocationId short-circuits before querying the DB — no mock needed here.

      const req = {
        user: { userId: 42 },
        body: {
          serviceType: "MOTORCYCLE",
          quotationId: "QUOTE_12345",
          feeTotal: 150,
          expiresAt: "2099-03-01T12:00:00Z",
          // New schema: pass location objects (backend will resolve/create)
          pickup: {
            locationId: 1,
          },
          dropoff: {
            locationId: 2,
          },
          senderName: "Alice",
          senderPhone: "+886912345678",
          recipientName: "Bob",
          recipientPhone: "+886987654321",
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      const next = jest.fn();

      // Extract route handler directly
      const layers = router.stack as unknown as RouterLayer[];
      const layer = layers.find((l) => l.route?.path === "/checkout");
      const handler = layer?.route?.stack[1]?.handle;
      expect(handler).toBeDefined();

      if (handler) {
        await handler(req, res, next);
      }

      expect(mockPaymentService.createCheckoutOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          quotationId: "QUOTE_12345",
          feeTotal: 150,
          pickupLocationId: 1,
          dropoffLocationId: 2,
        }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          session: expect.objectContaining({
            checkoutActionUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
          }),
        }),
      );
    });
  });

  describe("POST /ecpay/callback", () => {
    it("should invoke handlePaymentCallback and ALWAYS respond with 200 and text '1|OK'", async () => {
      mockPaymentService.handlePaymentCallback.mockResolvedValue({
        status: "PROCESSED",
        message: "Payment processed",
      });

      const req = {
        body: {
          MerchantID: "3002607",
          MerchantTradeNo: "MW12345",
          RtnCode: "1",
          CheckMacValue: "MOCK_CMV",
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      const next = jest.fn();

      const layers = router.stack as unknown as RouterLayer[];
      const layer = layers.find((l) => l.route?.path === "/ecpay/callback");
      const handler = layer?.route?.stack[0]?.handle;
      expect(handler).toBeDefined();

      if (handler) {
        await handler(req, res, next);
      }

      expect(mockPaymentService.handlePaymentCallback).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith("1|OK");
    });
  });
});
