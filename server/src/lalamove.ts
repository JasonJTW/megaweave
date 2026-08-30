import express, { Request, Response } from "express";
import { Server } from "socket.io";
import {
  requestLalamoveQuotation,
  createLalamoveOrder,
  getLalamoveOrderDetail,
  cancelLalamoveOrder,
  getLalamoveDriverDetail,
  verifyLalamoveWebhookSignature,
  sandboxUpdateDriverLocation,
  sandboxPickup,
  sandboxDeliver,
  GetQuotationParams,
  CreateOrderParams,
  getLalamoveMarketInfo,
} from "./services/lalamove";

const router = express.Router();

export const ALL_SUPPORTED_SERVICE_TYPES = [
  "MOTORCYCLE",
  "MOTORCYCLE_INTERCITY",
  "MOTORCYCLE_LARGELALABAG",
  "VAN",
  "SUV",
  "TRUCK175",
  "TRUCK330",
  "TRUCK500",
];

/**
 * GET /api/lalamove/service-types
 * Returns official available vehicle types and special requests in Taiwan (Source of Truth)
 */
router.get("/service-types", async (req: Request, res: Response): Promise<void> => {
  try {
    const market = await getLalamoveMarketInfo(req.query.refresh === "true");
    const requestedCity = req.query.city as string | undefined;

    let cities = market?.cities || [];
    if (requestedCity) {
      cities = cities.filter((c: { id: string; name: string }) =>
        c.id.toLowerCase().includes(requestedCity.toLowerCase()) ||
        c.name.includes(requestedCity)
      );
    }

    res.json({
      success: true,
      market: "TW",
      cities,
      allSupportedTypes: ALL_SUPPORTED_SERVICE_TYPES,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "取得車型資料失敗";
    res.status(500).json({ error: "Failed to retrieve market info", message });
  }
});

/**
 * POST /api/lalamove/quotation
 * Request delivery quotation for one or multiple service types
 */
router.post("/quotation", async (req: Request, res: Response): Promise<void> => {
  try {
    const { serviceType, serviceTypes, stops, language, scheduleAt } = req.body;

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      res.status(400).json({
        error: "Stops are required and must have at least 2 locations (pickup and drop-off)",
      });
      return;
    }

    const [origin, destination] = stops;
    if (!origin?.address || !destination?.address) {
      res.status(400).json({
        error: "Both pickup and drop-off must provide an address",
      });
      return;
    }

    // Determine target service types
    const typesToFetch: string[] =
      serviceTypes && Array.isArray(serviceTypes) && serviceTypes.length > 0
        ? serviceTypes
        : [serviceType || "MOTORCYCLE"];

    const quotations = await Promise.all(
      typesToFetch.map(async (st: string) => {
        const params: GetQuotationParams = {
          serviceType: st,
          stops,
          language: language || "zh_TW",
          scheduleAt,
        };
        const result = await requestLalamoveQuotation(params);
        return {
          ...result,
          serviceName: st,
        };
      }),
    );

    res.json({
      success: true,
      quotations,
      primary: quotations[0],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Lalamove quotation route error:", error);
    res.status(500).json({
      error: "Failed to get Lalamove quotation",
      message,
    });
  }
});

/**
 * POST /api/lalamove/orders
 * 下單建立 Lalamove 配送
 */
router.post("/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      quotationId,
      sender,
      recipients,
      isPODEnabled,
      isRecipientSmsEnabled,
      partner,
      metadata,
    } = req.body;

    if (!quotationId) {
      res.status(400).json({ error: "quotationId is required" });
      return;
    }

    if (!sender?.name || !sender?.phone) {
      res.status(400).json({ error: "Sender name and phone are required" });
      return;
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "At least one recipient is required" });
      return;
    }

    for (const r of recipients) {
      if (!r.name || !r.phone) {
        res.status(400).json({ error: "Each recipient must have name and phone" });
        return;
      }
    }

    const orderParams: CreateOrderParams = {
      quotationId,
      sender,
      recipients,
      isPODEnabled,
      isRecipientSmsEnabled,
      partner,
      metadata,
    };

    const orderResult = await createLalamoveOrder(orderParams);

    // Broadcast new order event to socket room if available
    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io && orderResult.orderId) {
      io.to(`delivery_${orderResult.orderId}`).emit("delivery_update", orderResult);
    }

    res.status(201).json({
      success: true,
      order: orderResult,
    });
  } catch (error: unknown) {
    const errObj = error as {
      httpStatus?: number;
      errors?: Array<{ id?: string; message?: string; detail?: string }>;
      message?: string;
    };
    const detailMsg =
      errObj.errors && errObj.errors.length > 0
        ? `${errObj.errors[0].id || ""}: ${errObj.errors[0].message || ""}`
        : errObj.message || "Failed to create order";

    console.error("Lalamove create order error:", error);
    res.status(500).json({
      error: "Failed to create Lalamove order",
      message: detailMsg,
      details: errObj.errors,
    });
  }
});

/**
 * GET /api/lalamove/orders/:orderId
 * 取得訂單最新狀態、詳細資訊與司機即時座標
 */
router.get("/orders/:orderId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const orderDetail = await getLalamoveOrderDetail(orderId);
    res.json({
      success: true,
      order: orderDetail,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get order details";
    console.error(`Lalamove get order ${req.params.orderId} error:`, error);
    res.status(500).json({
      error: "Failed to get Lalamove order details",
      message,
    });
  }
});

/**
 * DELETE /api/lalamove/orders/:orderId
 * 取消 Lalamove 訂單
 */
router.delete("/orders/:orderId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const cancelResult = await cancelLalamoveOrder(orderId);

    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io) {
      io.to(`delivery_${orderId}`).emit("delivery_update", {
        orderId,
        status: "CANCELED",
      });
    }

    res.json({
      success: true,
      result: cancelResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel order";
    console.error(`Lalamove cancel order ${req.params.orderId} error:`, error);
    res.status(500).json({
      error: "Failed to cancel Lalamove order",
      message,
    });
  }
});

/**
 * POST /api/lalamove/orders/:orderId/cancel
 * 取消訂單 (POST 備援端點)
 */
router.post("/orders/:orderId/cancel", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const cancelResult = await cancelLalamoveOrder(orderId);

    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io) {
      io.to(`delivery_${orderId}`).emit("delivery_update", {
        orderId,
        status: "CANCELED",
      });
    }

    res.json({
      success: true,
      result: cancelResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel order";
    console.error(`Lalamove cancel order (POST) ${req.params.orderId} error:`, error);
    res.status(500).json({
      error: "Failed to cancel Lalamove order",
      message,
    });
  }
});

/**
 * GET /api/lalamove/orders/:orderId/driver
 * 取得指定訂單司機位置資訊
 */
router.get("/orders/:orderId/driver", async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const driverId = req.query.driverId as string;

    if (!orderId || !driverId) {
      res.status(400).json({ error: "orderId and driverId query param are required" });
      return;
    }

    const driver = await getLalamoveDriverDetail(orderId, driverId);
    res.json({
      success: true,
      driver,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get driver";
    console.error("Lalamove get driver error:", error);
    res.status(500).json({
      error: "Failed to get driver details",
      message,
    });
  }
});

/**
 * POST /api/lalamove/webhook
 * Lalamove Webhook 接收端點 (訂單狀態變化、司機接單、司機位置改變)
 */
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawSignature = (req.headers["x-llm-signature"] ||
      req.headers["x-signature"] ||
      req.headers["x-lalamove-signature"]) as string | undefined;
    const rawTimestamp = req.headers["x-llm-timestamp"] as string | undefined;

    // Verify signature
    const isValid = verifyLalamoveWebhookSignature(
      JSON.stringify(req.body),
      rawSignature,
      rawTimestamp,
    );

    if (!isValid) {
      console.warn("[Lalamove Webhook] Signature verification failed");
      // In sandbox/testing we can continue or return 401
    }

    const payload = req.body;
    console.log("[Lalamove Webhook] Received webhook event:", JSON.stringify(payload, null, 2));

    const eventType = payload.eventType || payload.event || payload.type;
    const eventData = payload.data || payload;
    const orderId = eventData?.order?.id || eventData?.orderId || payload.orderId;

    if (orderId) {
      const io: Server | undefined = res.locals.io || req.app.get("io");
      if (io) {
        io.to(`delivery_${orderId}`).emit("delivery_update", {
          orderId,
          eventType,
          eventData,
          updatedAt: new Date().toISOString(),
        });
        console.log(`[Lalamove Webhook] Broadcasted event ${eventType} to delivery_${orderId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error: unknown) {
    console.error("[Lalamove Webhook] Error processing webhook:", error);
    res.status(500).json({ error: "Webhook processing error" });
  }
});

/**
 * Sandbox 测試面板（僅從 NODE_ENV=development 時開放）
 */
const isSandboxMode =
  (process.env.LALAMOVE_ENV || "sandbox").toLowerCase() === "sandbox" &&
  process.env.NODE_ENV !== "production";

/**
 * PUT /api/lalamove/sandbox/driver-location
 * [Sandbox only] 更新司機 GPS 座標
 */
router.put("/sandbox/driver-location", async (req: Request, res: Response): Promise<void> => {
  if (!isSandboxMode) {
    res.status(403).json({ error: "Sandbox endpoints are only available in development mode" });
    return;
  }
  try {
    const { orderId, lat, lng } = req.body as { orderId: string; lat: string; lng: string };
    if (!orderId || !lat || !lng) {
      res.status(400).json({ error: "orderId, lat and lng are required" });
      return;
    }
    const result = await sandboxUpdateDriverLocation(orderId, lat, lng);

    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io) {
      io.to(`delivery_${orderId}`).emit("delivery_update", {
        orderId,
        driver: { coordinates: { lat, lng } },
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sandbox error";
    console.error("[Sandbox] driver-location error:", error);
    res.status(500).json({ error: "Sandbox driver location update failed", message });
  }
});

/**
 * PUT /api/lalamove/sandbox/pickup
 * [Sandbox only] 模擬司機已取件
 */
router.put("/sandbox/pickup", async (req: Request, res: Response): Promise<void> => {
  if (!isSandboxMode) {
    res.status(403).json({ error: "Sandbox endpoints are only available in development mode" });
    return;
  }
  try {
    const { orderId } = req.body as { orderId: string };
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }
    const result = await sandboxPickup(orderId);

    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io) {
      io.to(`delivery_${orderId}`).emit("delivery_update", {
        orderId,
        status: "PICKED_UP",
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sandbox error";
    console.error("[Sandbox] pickup error:", error);
    res.status(500).json({ error: "Sandbox pickup failed", message });
  }
});

/**
 * PUT /api/lalamove/sandbox/deliver
 * [Sandbox only] 模擬送達完成
 */
router.put("/sandbox/deliver", async (req: Request, res: Response): Promise<void> => {
  if (!isSandboxMode) {
    res.status(403).json({ error: "Sandbox endpoints are only available in development mode" });
    return;
  }
  try {
    const { orderId } = req.body as { orderId: string };
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }
    const result = await sandboxDeliver(orderId);

    const io: Server | undefined = res.locals.io || req.app.get("io");
    if (io) {
      io.to(`delivery_${orderId}`).emit("delivery_update", {
        orderId,
        status: "COMPLETED",
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sandbox error";
    console.error("[Sandbox] deliver error:", error);
    res.status(500).json({ error: "Sandbox deliver failed", message });
  }
});

export default router;
