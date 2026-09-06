import { Request, Response, RequestHandler } from "express";
import lalamoveRouter from "./lalamove";
import dbPool from "./utils/db";
import * as lalamoveService from "./services/lalamove";

// Mock dependencies
jest.mock("./utils/db", () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

jest.mock("./services/lalamove", () => ({
  ...jest.requireActual("./services/lalamove"),
  cancelLalamoveOrder: jest.fn(),
  getLalamoveDriverDetail: jest.fn(),
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (req: Request, res: Response, next: () => void) => {
    // If req has user attached, proceed; otherwise 401
    if ((req as unknown as { user?: { userId: number } }).user) {
      next();
    } else {
      res.status(401).json({ errorMessage: "Please login first" });
    }
  },
}));

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
}

function getRouteHandlers(path: string, method: "get" | "post" | "delete"): RequestHandler[] {
  const layers = (lalamoveRouter as unknown as { stack: RouterLayer[] }).stack;
  const match = layers.find(
    (l) => l.route?.path === path && l.route?.methods[method] === true,
  );
  if (!match || !match.route) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return match.route.stack.map((s) => s.handle);
}

describe("Lalamove Routes Authentication & Ownership Protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /orders/:orderId", () => {
    const handlers = getRouteHandlers("/orders/:orderId", "get");
    const authMiddleware = handlers[0];
    const orderHandler = handlers[1];

    it("should reject unauthenticated request with 401", async () => {
      const req = {
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      const next = jest.fn();

      await authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject non-existent order request with 404", async () => {
      (dbPool.query as jest.Mock).mockResolvedValueOnce([[]]);

      const req = {
        user: { userId: 99, role: "user" },
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await orderHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Delivery order not found",
      });
    });

    it("should reject non-owner request with 403 (and NOT pass-through to remote API)", async () => {
      // Order exists with user_id: 14, but requester is user: 99
      (dbPool.query as jest.Mock).mockResolvedValueOnce([
        [{ id: 1, user_id: 14, seller_user_id: 59 }],
      ]);

      const req = {
        user: { userId: 99, role: "user" },
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await orderHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: You do not have permission to view this order",
      });
    });

    it("should return order details for authorized owner", async () => {
      const mockOrderRow = {
        id: 1,
        user_id: 42,
        seller_user_id: 59,
        status: "ASSIGNING_DRIVER",
        driver_name: null,
        driver_phone: null,
        driver_plate_number: null,
        lalamove_order_id: "LALA_123",
        share_link: "https://lala.link/track",
        service_type: "MOTORCYCLE",
        fee_total: 120,
        updated_at: "2026-09-06T12:00:00Z",
        version: 1,
        sender_name: "Alice",
        sender_phone: "0912345678",
        recipient_name: "Bob",
        recipient_phone: "0987654321",
        pickup_full_address: "Taipei 101",
        pickup_lat: "25.0339",
        pickup_lng: "121.5645",
        dropoff_full_address: "Taipei Main Station",
        dropoff_lat: "25.0478",
        dropoff_lng: "121.5170",
      };
      (dbPool.query as jest.Mock).mockResolvedValueOnce([[mockOrderRow]]);

      const req = {
        user: { userId: 42, role: "user" },
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await orderHandler(req, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          order: expect.objectContaining({
            orderId: "LALA_123",
            status: "ASSIGNING_DRIVER",
            shareLink: "https://lala.link/track",
            _source: "db",
          }),
        }),
      );
    });
  });

  describe("DELETE /orders/:orderId", () => {
    const handlers = getRouteHandlers("/orders/:orderId", "delete");
    const authMiddleware = handlers[0];
    const cancelHandler = handlers[1];

    it("should reject unauthenticated request with 401", async () => {
      const req = {
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await authMiddleware(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should reject cancellation if user is not the order creator and not admin", async () => {
      // Order belongs to user 88, but requester is user 99
      (dbPool.query as jest.Mock).mockResolvedValueOnce([
        [{ id: 1, status: "ASSIGNING_DRIVER", user_id: 88 }],
      ]);

      const req = {
        user: { userId: 99, role: "user" },
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await cancelHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: You cannot cancel this order",
      });
      expect(lalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
    });

    it("should reject cancellation if status is COMPLETED or non-cancellable", async () => {
      (dbPool.query as jest.Mock).mockResolvedValueOnce([
        [{ id: 1, status: "COMPLETED", user_id: 42 }],
      ]);

      const req = {
        user: { userId: 42, role: "user" },
        params: { orderId: "LALA_123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await cancelHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Cannot cancel order with current status: COMPLETED",
      });
      expect(lalamoveService.cancelLalamoveOrder).not.toHaveBeenCalled();
    });

    it("should allow order creator to cancel when status is cancellable", async () => {
      (dbPool.query as jest.Mock)
        .mockResolvedValueOnce([[{ id: 1, status: "ASSIGNING_DRIVER", user_id: 42 }]]) // query order
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update status

      (lalamoveService.cancelLalamoveOrder as jest.Mock).mockResolvedValueOnce({
        orderId: "LALA_123",
        status: "CANCELED",
      });

      const req = {
        user: { userId: 42, role: "user" },
        params: { orderId: "LALA_123" },
        app: { get: jest.fn().mockReturnValue(null) },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: {},
      } as unknown as Response;

      await cancelHandler(req, res, jest.fn());

      expect(lalamoveService.cancelLalamoveOrder).toHaveBeenCalledWith("LALA_123");
      expect(dbPool.query).toHaveBeenCalledWith(
        "UPDATE delivery_orders SET status = 'CANCELLED', version = version + 1 WHERE lalamove_order_id = ?",
        ["LALA_123"],
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: { orderId: "LALA_123", status: "CANCELED" },
      });
    });
  });

  describe("GET /orders/:orderId/driver", () => {
    const handlers = getRouteHandlers("/orders/:orderId/driver", "get");
    const driverHandler = handlers[1];

    it("should return 404 if order does not exist", async () => {
      (dbPool.query as jest.Mock).mockResolvedValueOnce([[]]);

      const req = {
        user: { userId: 99, role: "user" },
        params: { orderId: "LALA_123" },
        query: { driverId: "DRV_1" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await driverHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(lalamoveService.getLalamoveDriverDetail).not.toHaveBeenCalled();
    });

    it("should return 403 if user is not authorized to view driver", async () => {
      (dbPool.query as jest.Mock).mockResolvedValueOnce([
        [{ id: 1, user_id: 14, seller_user_id: 59 }],
      ]);

      const req = {
        user: { userId: 99, role: "user" },
        params: { orderId: "LALA_123" },
        query: { driverId: "DRV_1" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await driverHandler(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(lalamoveService.getLalamoveDriverDetail).not.toHaveBeenCalled();
    });

    it("should return driver detail if user is authorized", async () => {
      (dbPool.query as jest.Mock).mockResolvedValueOnce([
        [{ id: 1, user_id: 42, seller_user_id: 59, lalamove_order_id: "LALA_123" }],
      ]);
      (lalamoveService.getLalamoveDriverDetail as jest.Mock).mockResolvedValueOnce({
        name: "Driver Lee",
        phone: "0900111222",
      });

      const req = {
        user: { userId: 42, role: "user" },
        params: { orderId: "LALA_123" },
        query: { driverId: "DRV_1" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await driverHandler(req, res, jest.fn());

      expect(lalamoveService.getLalamoveDriverDetail).toHaveBeenCalledWith(
        "LALA_123",
        "DRV_1",
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        driver: { name: "Driver Lee", phone: "0900111222" },
      });
    });
  });
});
