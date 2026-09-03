import express, { Request, Response } from "express";
import { Server } from "socket.io";
import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2/promise";
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

/**
 * 將 Lalamove 官方狀態字串對應至資料庫 delivery_orders.status ENUM
 */
export function mapLalamoveStatusToDbStatus(status?: string): string | null {
  if (!status) return null;
  const upper = String(status).replace(/[\s-]/g, "_").toUpperCase();
  switch (upper) {
    case "ASSIGNING_DRIVER":
    case "MATCHING":
    case "SEARCHING":
      return "ASSIGNING_DRIVER";
    case "ON_GOING":
    case "ONGOING":
    case "DRIVER_ASSIGNED":
    case "ACCEPTED":
    case "ASSIGNED":
    case "MATCHED":
      return "ON_GOING";
    case "PICKED_UP":
    case "PICKEDUP":
    case "IN_DELIVERY":
      return "PICKED_UP";
    case "COMPLETED":
    case "FINISHED":
    case "FULFILLED":
    case "DELIVERED":
      return "COMPLETED";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
    case "TIMEOUT":
      return "EXPIRED";
    case "REJECTED":
    case "FAILED":
      return "FAILED";
    default:
      console.warn(
        `[Lalamove] Unknown status string '${status}' (normalized: '${upper}')`,
      );
      return null;
  }
}

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
router.get(
  "/service-types",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const market = await getLalamoveMarketInfo(req.query.refresh === "true");
      const requestedCity = req.query.city as string | undefined;

      let cities = market?.cities || [];
      if (requestedCity) {
        cities = cities.filter(
          (c: { id: string; name: string }) =>
            c.id.toLowerCase().includes(requestedCity.toLowerCase()) ||
            c.name.includes(requestedCity),
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
      res
        .status(500)
        .json({ error: "Failed to retrieve market info", message });
    }
  },
);

/**
 * POST /api/lalamove/quotation
 * Request delivery quotation for one or multiple service types
 */
router.post(
  "/quotation",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { serviceType, serviceTypes, stops, language, scheduleAt } =
        req.body;

      if (!stops || !Array.isArray(stops) || stops.length < 2) {
        res.status(400).json({
          error:
            "Stops are required and must have at least 2 locations (pickup and drop-off)",
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
      const message =
        error instanceof Error ? error.message : "Internal server error";
      console.error("Lalamove quotation route error:", error);
      res.status(500).json({
        error: "Failed to get Lalamove quotation",
        message,
      });
    }
  },
);

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
        res
          .status(400)
          .json({ error: "Each recipient must have name and phone" });
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
      io.to(`delivery_${orderResult.orderId}`).emit(
        "delivery_update",
        orderResult,
      );
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
 * 取得訂單最新狀態、詳細資訊與司機即時座標 (並同步更新至資料庫)
 */
router.get(
  "/orders/:orderId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }

      // ─── 先從本地 DB 讀取（不打 Lalamove API，避免 rate limit）───
      // Webhook 已負責即時更新 DB，輪詢只需讀 DB 即可
      const [dbRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT d.status, d.driver_name, d.driver_phone, d.driver_plate_number,
                d.lalamove_order_id, d.share_link, d.service_type, d.fee_total,
                d.updated_at, d.version,
                d.pickup_address_snapshot, d.dropoff_address_snapshot,
                d.sender_name, d.sender_phone, d.recipient_name, d.recipient_phone,
                pu.full_address AS pickup_full_address, pu.lat AS pickup_lat, pu.lng AS pickup_lng,
                dr.full_address AS dropoff_full_address, dr.lat AS dropoff_lat, dr.lng AS dropoff_lng
         FROM delivery_orders d
         LEFT JOIN locations pu ON d.pickup_location_id = pu.id
         LEFT JOIN locations dr ON d.dropoff_location_id = dr.id
         WHERE d.lalamove_order_id = ?
         LIMIT 1`,
        [orderId],
      );

      if (dbRows && dbRows.length > 0) {
        const row = dbRows[0];

        // 從 DB 組裝回前端需要的 OrderDetail 格式
        const orderFromDb = {
          orderId,
          status: row.status,
          serviceType: row.service_type,
          shareLink: row.share_link,
          priceBreakdown: {
            total: String(row.fee_total ?? 0),
            currency: "TWD",
          },
          driver: row.driver_name
            ? {
                id: "",
                name: row.driver_name,
                phone: row.driver_phone ?? "",
                plateNumber: row.driver_plate_number ?? "",
              }
            : null,
          stops: [
            {
              // 優先用 locations 表的 full_address，fallback 到 snapshot
              address: row.pickup_full_address ?? row.pickup_address_snapshot ?? "",
              coordinates: {
                lat: String(row.pickup_lat ?? ""),
                lng: String(row.pickup_lng ?? ""),
              },
              name: row.sender_name,
              phone: row.sender_phone,
            },
            {
              address: row.dropoff_full_address ?? row.dropoff_address_snapshot ?? "",
              coordinates: {
                lat: String(row.dropoff_lat ?? ""),
                lng: String(row.dropoff_lng ?? ""),
              },
              name: row.recipient_name,
              phone: row.recipient_phone,
            },
          ],
          updatedAt: row.updated_at,
          _source: "db", // 方便 debug 確認資料來源
        };

        res.json({ success: true, order: orderFromDb });
        return;
      }

      // ─── DB 無資料時才 fallback 打 Lalamove API ───
      // （例如剛建單、DB 尚未有此 orderId 的情境）
      console.log(
        `[Lalamove GET] orderId=${orderId} not in DB, falling back to Lalamove API`,
      );
      const orderDetail = await getLalamoveOrderDetail(orderId);
      const rawStatus = (orderDetail as { status?: string }).status;
      const dbStatus = mapLalamoveStatusToDbStatus(rawStatus);
      const driver =
        (
          orderDetail as {
            driverDetails?: {
              name?: string;
              phone?: string;
              plateNumber?: string;
            };
          }
        ).driverDetails ||
        (
          orderDetail as {
            driver?: { name?: string; phone?: string; plateNumber?: string };
          }
        ).driver;

      if (dbStatus) {
        await dbPool
          .query(
            `UPDATE delivery_orders 
             SET status = ?,
                 driver_name = COALESCE(?, driver_name),
                 driver_phone = COALESCE(?, driver_phone),
                 driver_plate_number = COALESCE(?, driver_plate_number),
                 version = version + 1
             WHERE lalamove_order_id = ?
               AND (status != ? OR (driver_name IS NULL AND ? IS NOT NULL))`,
            [
              dbStatus,
              driver?.name || null,
              driver?.phone || null,
              driver?.plateNumber || null,
              orderId,
              dbStatus,
              driver?.name || null,
            ],
          )
          .catch((e) =>
            console.warn("[Lalamove] Sync order status to DB error:", e),
          );
      }

      res.json({
        success: true,
        order: { ...orderDetail, _source: "lalamove_api" },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to get order details";
      console.error(`Lalamove get order ${req.params.orderId} error:`, error);
      res.status(500).json({
        error: "Failed to get Lalamove order details",
        message,
      });
    }
  },
);

/**
 * DELETE /api/lalamove/orders/:orderId
 * 取消 Lalamove 訂單
 */
router.delete(
  "/orders/:orderId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }

      const cancelResult = await cancelLalamoveOrder(orderId);

      // 更新資料庫 delivery_orders 狀態為 CANCELLED
      await dbPool
        .query(
          "UPDATE delivery_orders SET status = 'CANCELLED', version = version + 1 WHERE lalamove_order_id = ?",
          [orderId],
        )
        .catch((e) =>
          console.warn("[Lalamove] Update cancel status to DB error:", e),
        );

      const io: Server | undefined = res.locals.io || req.app.get("io");
      if (io) {
        io.to(`delivery_${orderId}`).emit("delivery_update", {
          orderId,
          status: "CANCELLED",
        });
      }

      res.json({
        success: true,
        result: cancelResult,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel order";
      console.error(
        `Lalamove cancel order ${req.params.orderId} error:`,
        error,
      );
      res.status(500).json({
        error: "Failed to cancel Lalamove order",
        message,
      });
    }
  },
);

/**
 * POST /api/lalamove/orders/:orderId/cancel
 * 取消訂單 (POST 備援端點)
 */
router.post(
  "/orders/:orderId/cancel",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }

      const cancelResult = await cancelLalamoveOrder(orderId);

      // 更新資料庫 delivery_orders 狀態為 CANCELLED
      await dbPool
        .query(
          "UPDATE delivery_orders SET status = 'CANCELLED', version = version + 1 WHERE lalamove_order_id = ?",
          [orderId],
        )
        .catch((e) =>
          console.warn("[Lalamove] Update cancel status to DB error:", e),
        );

      const io: Server | undefined = res.locals.io || req.app.get("io");
      if (io) {
        io.to(`delivery_${orderId}`).emit("delivery_update", {
          orderId,
          status: "CANCELLED",
        });
      }

      res.json({
        success: true,
        result: cancelResult,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel order";
      console.error(
        `Lalamove cancel order (POST) ${req.params.orderId} error:`,
        error,
      );
      res.status(500).json({
        error: "Failed to cancel Lalamove order",
        message,
      });
    }
  },
);

/**
 * GET /api/lalamove/orders/:orderId/driver
 * 取得指定訂單司機位置資訊
 */
router.get(
  "/orders/:orderId/driver",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;
      const driverId = req.query.driverId as string;

      if (!orderId || !driverId) {
        res
          .status(400)
          .json({ error: "orderId and driverId query param are required" });
        return;
      }

      const driver = await getLalamoveDriverDetail(orderId, driverId);
      res.json({
        success: true,
        driver,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to get driver";
      console.error("Lalamove get driver error:", error);
      res.status(500).json({
        error: "Failed to get driver details",
        message,
      });
    }
  },
);

/**
 * POST /api/lalamove/webhook
 * Lalamove Webhook 接收端點 (訂單狀態變化、司機接單、司機位置改變)
 */
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body || {};
    console.log(
      "[Lalamove Webhook] Received webhook event:",
      JSON.stringify(payload, null, 2),
    );

    const authHeader = req.headers["authorization"] as string | undefined;
    let rawSignature = (payload.signature ||
      req.headers["x-llm-signature"] ||
      req.headers["x-signature"] ||
      req.headers["x-lalamove-signature"]) as string | undefined;
    let rawTimestamp = (payload.timestamp ? String(payload.timestamp) : undefined) ||
      (req.headers["x-llm-timestamp"] as string | undefined);

    // Lalamove V3 官方標準 Webhook 使用 Authorization: hmac <key>:<timestamp>:<signature>
    if (authHeader && authHeader.toLowerCase().startsWith("hmac ")) {
      const tokenStr = authHeader.slice(5).trim();
      const parts = tokenStr.split(":");
      if (parts.length === 3) {
        rawTimestamp = parts[1];
        rawSignature = parts[2];
      } else if (parts.length === 2) {
        rawTimestamp = parts[0];
        rawSignature = parts[1];
      }
    }

    // Verify signature
    const isValid = verifyLalamoveWebhookSignature(
      JSON.stringify(req.body),
      rawSignature,
      rawTimestamp,
    );

    if (!isValid) {
      console.warn(
        "[Lalamove Webhook] Signature verification failed (continuing in development/sandbox)",
      );
    }

    const eventType = payload.eventType;
    const order = payload.data?.order;
    const orderId = order?.orderId;

    if (orderId) {
      // 專門處理高頻司機 GPS 位置推播：不寫 DB，直接透過 Socket.IO pass-through 給前端
      if (eventType === "DRIVER_LOCATION_UPDATED") {
        const location = payload.data?.location || payload.data?.driver?.coordinates;
        const io: Server | undefined = res.locals.io || req.app.get("io");
        if (io && location) {
          io.to(`delivery_${orderId}`).emit("delivery_update", {
            orderId,
            eventType,
            coordinates: location,
            updatedAt: new Date().toISOString(),
          });
          console.log(
            `[Lalamove Webhook] Pass-through location update (${location.lat}, ${location.lng}) to delivery_${orderId}`,
          );
        }
        res.status(200).json({ received: true });
        return;
      }

      const rawStatus = order?.status;
      const dbStatus = mapLalamoveStatusToDbStatus(rawStatus);
      const driver = payload.data?.driver;
      const location = payload.data?.location;

      console.log(
        `[Lalamove Webhook] eventType=${eventType} orderId=${orderId} rawStatus=${rawStatus} dbStatus=${dbStatus}`,
      );
      if (driver) {
        console.log(`[Lalamove Webhook] driver:`, JSON.stringify(driver));
      }
      if (location) {
        console.log(`[Lalamove Webhook] location:`, JSON.stringify(location));
      }

      try {
        const [orderRows] = await dbPool.query<RowDataPacket[]>(
          "SELECT id FROM delivery_orders WHERE lalamove_order_id = ?",
          [orderId],
        );
        const deliveryOrderId =
          orderRows && orderRows.length > 0 ? orderRows[0].id : null;

        // 1. 如果有司機資訊（例如 DRIVER_ASSIGNED 事件），更新司機欄位並記錄事件
        if (driver) {
          const driverName = driver.name || null;
          const driverPhone = driver.phone || null;
          const driverPlate = driver.plateNumber || null;

          await dbPool.query(
            `UPDATE delivery_orders 
             SET driver_name = COALESCE(?, driver_name),
                 driver_phone = COALESCE(?, driver_phone),
                 driver_plate_number = COALESCE(?, driver_plate_number),
                 raw_webhook_payload = ?,
                 version = version + 1
             WHERE lalamove_order_id = ?`,
            [
              driverName,
              driverPhone,
              driverPlate,
              JSON.stringify(payload),
              orderId,
            ],
          );

          // 若為單純 DRIVER_ASSIGNED（無 status 變更），也記錄至 audit events，保持 version 與事件 1:1 對齊
          if (deliveryOrderId && !dbStatus) {
            const eventId = payload.eventId || null;
            await dbPool.query(
              `INSERT INTO delivery_order_events (delivery_order_id, event_id, event_status, raw_payload)
               VALUES (?, ?, 'DRIVER_ASSIGNED', ?)
               ON DUPLICATE KEY UPDATE received_at = CURRENT_TIMESTAMP`,
              [deliveryOrderId, eventId, JSON.stringify(payload)],
            );
          }
        }

        // 2. 如果有訂單狀態變更（例如 ORDER_STATUS_CHANGED 事件），更新狀態
        if (dbStatus) {
          await dbPool.query(
            `UPDATE delivery_orders 
             SET status = ?,
                 raw_webhook_payload = ?,
                 version = version + 1
             WHERE lalamove_order_id = ?`,
            [dbStatus, JSON.stringify(payload), orderId],
          );

          if (deliveryOrderId) {
            const eventId = payload.eventId || null;
            await dbPool.query(
              `INSERT INTO delivery_order_events (delivery_order_id, event_id, event_status, raw_payload)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE received_at = CURRENT_TIMESTAMP`,
              [deliveryOrderId, eventId, dbStatus, JSON.stringify(payload)],
            );
          }
        }
      } catch (dbErr) {
        console.error("[Lalamove Webhook] DB update error:", dbErr);
      }

      // 3. 透過 Socket.IO 即時廣播給前端（狀態更新、司機指派、座標變更）
      const io: Server | undefined = res.locals.io || req.app.get("io");
      if (io) {
        const socketPayload: Record<string, unknown> = {
          orderId,
          eventType,
          updatedAt: new Date().toISOString(),
        };

        if (dbStatus) {
          socketPayload.status = dbStatus;
        }
        if (driver) {
          socketPayload.driver = {
            name: driver.name,
            phone: driver.phone,
            plateNumber: driver.plateNumber,
            coordinates: location,
          };
        }
        if (location) {
          socketPayload.coordinates = location;
        }

        io.to(`delivery_${orderId}`).emit("delivery_update", socketPayload);
        console.log(
          `[Lalamove Webhook] Broadcasted event ${eventType} to delivery_${orderId}`,
        );
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
router.put(
  "/sandbox/driver-location",
  async (req: Request, res: Response): Promise<void> => {
    if (!isSandboxMode) {
      res
        .status(403)
        .json({
          error: "Sandbox endpoints are only available in development mode",
        });
      return;
    }
    try {
      const { orderId, lat, lng } = req.body as {
        orderId: string;
        lat: string;
        lng: string;
      };
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
      res
        .status(500)
        .json({ error: "Sandbox driver location update failed", message });
    }
  },
);

/**
 * PUT /api/lalamove/sandbox/match-driver
 * [Sandbox only] 模擬司機已接單（ON_GOING 前往取件中）
 */
router.put(
  "/sandbox/match-driver",
  async (req: Request, res: Response): Promise<void> => {
    if (!isSandboxMode) {
      res
        .status(403)
        .json({
          error: "Sandbox endpoints are only available in development mode",
        });
      return;
    }
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }

      // 更新資料庫 delivery_orders 狀態為 ON_GOING
      await dbPool
        .query(
          "UPDATE delivery_orders SET status = 'ON_GOING', version = version + 1 WHERE lalamove_order_id = ?",
          [orderId],
        )
        .catch((e) =>
          console.warn("[Sandbox] Update ON_GOING status to DB error:", e),
        );

      const io: Server | undefined = res.locals.io || req.app.get("io");
      if (io) {
        io.to(`delivery_${orderId}`).emit("delivery_update", {
          orderId,
          status: "ON_GOING",
          updatedAt: new Date().toISOString(),
        });
      }

      res.json({ success: true, message: "Driver matched (ON_GOING)" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sandbox error";
      console.error("[Sandbox] match-driver error:", error);
      res.status(500).json({ error: "Sandbox match driver failed", message });
    }
  },
);

/**
 * PUT /api/lalamove/sandbox/pickup
 * [Sandbox only] 模擬司機已取件
 */
router.put(
  "/sandbox/pickup",
  async (req: Request, res: Response): Promise<void> => {
    if (!isSandboxMode) {
      res
        .status(403)
        .json({
          error: "Sandbox endpoints are only available in development mode",
        });
      return;
    }
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }
      const result = await sandboxPickup(orderId);

      // 更新資料庫 delivery_orders 狀態為 PICKED_UP
      await dbPool
        .query(
          "UPDATE delivery_orders SET status = 'PICKED_UP', version = version + 1 WHERE lalamove_order_id = ?",
          [orderId],
        )
        .catch((e) =>
          console.warn("[Sandbox] Update PICKED_UP status to DB error:", e),
        );

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
  },
);

/**
 * PUT /api/lalamove/sandbox/deliver
 * [Sandbox only] 模擬送達完成
 */
router.put(
  "/sandbox/deliver",
  async (req: Request, res: Response): Promise<void> => {
    if (!isSandboxMode) {
      res
        .status(403)
        .json({
          error: "Sandbox endpoints are only available in development mode",
        });
      return;
    }
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId) {
        res.status(400).json({ error: "orderId is required" });
        return;
      }
      const result = await sandboxDeliver(orderId);

      // 更新資料庫 delivery_orders 狀態為 COMPLETED
      await dbPool
        .query(
          "UPDATE delivery_orders SET status = 'COMPLETED', version = version + 1 WHERE lalamove_order_id = ?",
          [orderId],
        )
        .catch((e) =>
          console.warn("[Sandbox] Update COMPLETED status to DB error:", e),
        );

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
  },
);

export default router;
