import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Server } from "socket.io";
import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2/promise";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import {
  requestLalamoveQuotation,
  cancelLalamoveOrder,
  getLalamoveDriverDetail,
  getLalamoveOrderDetail,
  verifyLalamoveWebhookSignature,
  sandboxUpdateDriverLocation,
  sandboxPickup,
  sandboxDeliver,
  GetQuotationParams,
  getLalamoveMarketInfo,
} from "./services/lalamove";
import {
  DeliveryStatus,
  canTransition,
  lalamoveFailureReason,
  transitionDeliveryOrder,
  DELIVERY_ACCESS_COLUMNS,
  DELIVERY_ACCESS_JOIN,
  canViewDeliveryOrder,
  type DeliveryAccessRow,
} from "./services/delivery";
import { isCancellationForbidden } from "./services/lalamoveErrors";
import { adoptLalamoveOrder } from "./services/deliveryRecovery";
import { HttpError } from "./utils/httpError";

/**
 * 將 Lalamove 官方狀態字串對應至資料庫 delivery_orders.status ENUM
 */
export function mapLalamoveStatusToDbStatus(
  status?: string,
): DeliveryStatus | null {
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

/**
 * Webhook 事件發生時間：優先 data.updatedAt，其次頂層 timestamp（秒或毫秒），都沒有才用收到的時間
 */
export function getWebhookEventTime(
  payload: { timestamp?: unknown; data?: { updatedAt?: unknown } },
  now: Date = new Date(),
): Date {
  const toDate = (value: unknown): Date | null => {
    if (value === undefined || value === null || value === "") return null;
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  return toDate(payload.data?.updatedAt) ?? toDate(payload.timestamp) ?? now;
}

const router = express.Router();

//* Lalamove API 呼叫失敗：細節進 log，回 502 給 client 顯示通用的物流錯誤
//* 只包 Lalamove API 呼叫本身；DB 等其他錯誤直接 next(error) 當 500
function deliveryProviderError(context: string, error: unknown) {
  if (error instanceof HttpError) return error;
  console.error(`Lalamove ${context} error:`, error);
  return new HttpError(
    502,
    "DELIVERY_PROVIDER_ERROR",
    `Failed to ${context}`,
  );
}

export const ALL_SUPPORTED_SERVICE_TYPES = [
  "MOTORCYCLE",
  "MOTORCYCLE_INTERCITY",
  "MOTORCYCLE_LARGELALABAG",
  "VAN",
  "SUV",
  "TRUCK175",
  "TRUCK330",
  "TRUCK500",
] as const;

const ServiceTypeSchema = z.enum(ALL_SUPPORTED_SERVICE_TYPES);

//* 每個 service type 都是一次付費的 Lalamove 呼叫：只收支援的車型，不重複，最多每種一次
const QuotationServiceTypesSchema = z.object({
  serviceType: ServiceTypeSchema.optional(),
  serviceTypes: z
    .array(ServiceTypeSchema)
    .min(1)
    .max(ALL_SUPPORTED_SERVICE_TYPES.length)
    .refine((types) => new Set(types).size === types.length, {
      message: "serviceTypes must be unique",
    })
    .optional(),
});

/**
 * GET /api/lalamove/service-types
 * Returns official available vehicle types and special requests in Taiwan (Source of Truth)
 */
router.get(
  "/service-types",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      //* 不開放 ?refresh：匿名呼叫者不能繞過 30 分鐘快取打到 Lalamove
      const market = await getLalamoveMarketInfo();
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
      return next(deliveryProviderError("retrieve market info", err));
    }
  },
);

/**
 * POST /api/lalamove/quotation
 * Request delivery quotation for one or multiple service types
 * 每次都打付費的 Lalamove API，只給登入的人用（client 未登入時也不展開報價）
 */
router.post(
  "/quotation",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stops, language, scheduleAt } = req.body;

      const parsedTypes = QuotationServiceTypesSchema.safeParse(req.body);
      if (!parsedTypes.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid service types"));
      }
      const { serviceType, serviceTypes } = parsedTypes.data;

      if (!stops || !Array.isArray(stops) || stops.length < 2) {
        return next(new HttpError(400, "INVALID_REQUEST", "Stops are required and must have at least 2 locations (pickup and drop-off)"));
      }

      const [origin, destination] = stops;
      if (!origin?.address || !destination?.address) {
        return next(new HttpError(400, "INVALID_REQUEST", "Both pickup and drop-off must provide an address"));
      }

      // Determine target service types
      const typesToFetch: string[] = serviceTypes ?? [serviceType ?? "MOTORCYCLE"];

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
      return next(deliveryProviderError("get quotation", error));
    }
  },
);

/**
 * GET /api/lalamove/orders/:orderId
 * 取得訂單最新狀態、詳細資訊與司機即時座標 (限定買方、賣方或管理員可查)
 */
router.get(
  "/orders/:orderId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userRole = authReq.user?.role;

      if (!userId) {
        return next(new HttpError(401, "UNAUTHENTICATED", "Unauthorized"));
      }

      const { orderId } = req.params;
      if (!orderId) {
        return next(new HttpError(400, "INVALID_REQUEST", "orderId is required"));
      }

      // ─── 檢查本地 DB 關聯與權限（限買方 d.user_id、賣方 p.user_id 或管理員）───
      const [dbRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT d.id, d.status, d.driver_name, d.driver_phone, d.driver_plate_number,
                d.lalamove_order_id, d.share_link, d.service_type, d.fee_total,
                d.updated_at,
                d.pickup_address_snapshot, d.dropoff_address_snapshot,
                d.sender_name, d.sender_phone, d.recipient_name, d.recipient_phone,
                ${DELIVERY_ACCESS_COLUMNS},
                pu.full_address AS pickup_full_address, pu.lat AS pickup_lat, pu.lng AS pickup_lng,
                dr.full_address AS dropoff_full_address, dr.lat AS dropoff_lat, dr.lng AS dropoff_lng
         FROM delivery_orders d
         LEFT JOIN locations pu ON d.pickup_location_id = pu.id
         LEFT JOIN locations dr ON d.dropoff_location_id = dr.id
         LEFT JOIN posts p ON d.post_id = p.id
         ${DELIVERY_ACCESS_JOIN}
         WHERE d.lalamove_order_id = ? OR d.id = ?
         LIMIT 1`,
        [orderId, orderId],
      );

      if (!dbRows || dbRows.length === 0) {
        return next(new HttpError(404, "DELIVERY_ORDER_NOT_FOUND", "Delivery order not found"));
      }

      const row = dbRows[0];
      //* 下單的人、Weave 的兩造（ADR 0001）或 Platform Admin（DeliveryOrder module）
      if (!canViewDeliveryOrder(row as DeliveryAccessRow, { userId, role: userRole })) {
        return next(new HttpError(403, "FORBIDDEN", "Forbidden: You do not have permission to view this order"));
      }

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
        _source: "db",
      };

      res.json({ success: true, order: orderFromDb });
    } catch (error: unknown) {
      return next(error);
    }
  },
);

/**
 * 共用取消訂單業務邏輯 (僅訂單建立者 d.user_id 或管理員可執行)
 */
async function handleCancelOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;
    const userRole = authReq.user?.role;
    if (!userId) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Unauthorized"));
    }

    const { orderId } = req.params;
    if (!orderId) {
      return next(new HttpError(400, "INVALID_REQUEST", "orderId is required"));
    }

    // 檢查訂單歸屬與目前狀態
    const [orderRows] = await dbPool.query<RowDataPacket[]>(
      "SELECT id, status, user_id, lalamove_order_id FROM delivery_orders WHERE lalamove_order_id = ? OR id = ? LIMIT 1",
      [orderId, orderId],
    );

    if (!orderRows || orderRows.length === 0) {
      return next(new HttpError(404, "DELIVERY_ORDER_NOT_FOUND", "Delivery order not found"));
    }

    const orderRecord = orderRows[0];
    if (orderRecord.user_id !== userId && userRole !== "admin") {
      return next(new HttpError(403, "FORBIDDEN", "Forbidden: You cannot cancel this order"));
    }

    // 已送達、司機已取件或已終止狀態不可取消（依狀態機判斷）
    if (!canTransition(orderRecord.status, "CANCELLED")) {
      return next(
        new HttpError(
          400,
          "ORDER_NOT_CANCELLABLE",
          `Cannot cancel order with current status: ${orderRecord.status}`,
        ),
      );
    }

    const io: Server | null = res.locals.io || req.app.get("io") || null;
    const lalamoveOrderId = orderRecord.lalamove_order_id as string | null;

    //* 還沒向 Lalamove 下單（例如還在等付款）：本機取消即可，沒有款要退
    if (!lalamoveOrderId) {
      await transitionDeliveryOrder(dbPool, { id: Number(orderRecord.id) }, "CANCELLED", {
        source: "user",
        payload: { source: "user", userId },
        io,
      });
      res.json({ success: true, result: { success: true, orderId } });
      return;
    }

    //* 能不能取消由 Lalamove 決定（配司機中，或司機接單不到 5 分鐘）。被拒就向 Lalamove 重拿狀態，
    //* 讓畫面顯示實際進度；不會因本機狀態落後而取消已上路的單
    let cancelResult: Awaited<ReturnType<typeof cancelLalamoveOrder>>;
    try {
      cancelResult = await cancelLalamoveOrder(lalamoveOrderId);
    } catch (error) {
      if (!isCancellationForbidden(error)) {
        throw deliveryProviderError(`cancel order ${lalamoveOrderId}`, error);
      }
      await syncFromLalamove(lalamoveOrderId, io).catch((e) =>
        console.warn(`[Lalamove] Status sync after refused cancel failed for ${lalamoveOrderId}:`, e),
      );
      return next(
        new HttpError(400, "ORDER_NOT_CANCELLABLE", "Lalamove no longer allows cancelling this order"),
      );
    }

    //* Lalamove 已接受取消：轉成 CANCELLED，已付款就全額退款（DeliveryOrder module）
    await transitionDeliveryOrder(dbPool, { lalamoveOrderId }, "CANCELLED", {
      source: "user",
      payload: { source: "user", userId, lalamove: cancelResult },
      refundReason: "USER_CANCELLED",
      io,
    });

    res.json({
      success: true,
      result: cancelResult,
    });
  } catch (error: unknown) {
    return next(error);
  }
}

/** 向 Lalamove 重拿一張單的狀態並套用（取消被拒時，本機狀態可能落後） */
async function syncFromLalamove(lalamoveOrderId: string, io: Server | null): Promise<void> {
  const detail = await getLalamoveOrderDetail(lalamoveOrderId);
  const remote = mapLalamoveStatusToDbStatus(detail?.status);
  if (!remote) return;
  await transitionDeliveryOrder(dbPool, { lalamoveOrderId }, remote, {
    source: "user",
    payload: { source: "cancel_refused_sync", remoteOrder: detail },
    failureReason: lalamoveFailureReason(remote, detail?.status),
    io,
  });
}

/**
 * DELETE /api/lalamove/orders/:orderId
 * 取消 Lalamove 訂單 (需授權)
 */
router.delete("/orders/:orderId", requireAuth, handleCancelOrder);

/**
 * POST /api/lalamove/orders/:orderId/cancel
 * 取消訂單 (POST 備援端點，需授權)
 */
router.post("/orders/:orderId/cancel", requireAuth, handleCancelOrder);

/**
 * GET /api/lalamove/orders/:orderId/driver
 * 取得指定訂單司機位置資訊 (限定買方、賣方或管理員可查)
 */
router.get(
  "/orders/:orderId/driver",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userRole = authReq.user?.role;
      if (!userId) {
        return next(new HttpError(401, "UNAUTHENTICATED", "Unauthorized"));
      }

      const { orderId } = req.params;
      const driverId = req.query.driverId as string;

      if (!orderId || !driverId) {
        return next(new HttpError(400, "INVALID_REQUEST", "orderId and driverId query param are required"));
      }

      // 與 GET /orders/:orderId 相同的權限（DeliveryOrder module）
      const [orderRows] = await dbPool.query<RowDataPacket[]>(
        `SELECT d.id, d.lalamove_order_id, ${DELIVERY_ACCESS_COLUMNS}
         FROM delivery_orders d
         LEFT JOIN posts p ON d.post_id = p.id
         ${DELIVERY_ACCESS_JOIN}
         WHERE d.lalamove_order_id = ? OR d.id = ?
         LIMIT 1`,
        [orderId, orderId],
      );

      if (!orderRows || orderRows.length === 0) {
        return next(new HttpError(404, "DELIVERY_ORDER_NOT_FOUND", "Delivery order not found"));
      }

      const orderRecord = orderRows[0];
      if (!canViewDeliveryOrder(orderRecord as DeliveryAccessRow, { userId, role: userRole })) {
        return next(new HttpError(403, "FORBIDDEN", "Forbidden: You do not have permission to view this order"));
      }

      const realLalamoveOrderId = orderRecord.lalamove_order_id || orderId;
      const driver = await getLalamoveDriverDetail(
        realLalamoveOrderId,
        driverId,
      ).catch((e) => {
        throw deliveryProviderError("get driver details", e);
      });
      res.json({
        success: true,
        driver,
      });
    } catch (error: unknown) {
      return next(error);
    }
  },
);

/**
 * POST /api/lalamove/webhook
 * Lalamove Webhook 接收端點 (訂單狀態變化、司機接單、司機位置改變)
 */
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    // server.ts 對此路由使用 express.raw()，req.body 為原始 Buffer，供驗簽使用
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Invalid webhook body" });
      return;
    }
    const rawBody = req.body.toString("utf8");

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      res.status(400).json({ error: "Invalid JSON payload" });
      return;
    }

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

    // Verify signature（先驗簽，再信任 payload 內容）
    const isValid = verifyLalamoveWebhookSignature(
      rawBody,
      rawSignature,
      rawTimestamp,
    );

    if (!isValid) {
      console.warn("[Lalamove Webhook] Signature verification failed");
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    console.log(
      "[Lalamove Webhook] Received webhook event:",
      JSON.stringify(payload, null, 2),
    );

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

      let statusApplied = false;
      try {
        const findByOrderId = () =>
          dbPool.query<RowDataPacket[]>(
            "SELECT id FROM delivery_orders WHERE lalamove_order_id = ?",
            [orderId],
          );
        let [orderRows] = await findByOrderId();

        // 不認得的 orderId：派單 saga 中斷（T2 回應遺失 / T3 寫入失敗 / 當機）時 orderId 沒寫入
        // → 以 quotationId 認領（ORDER_CREATED 直接帶；其他事件向 Lalamove 查詢）
        if (!orderRows || orderRows.length === 0) {
          const quotationId: string | undefined =
            order?.quotationId || (await getLalamoveOrderDetail(orderId))?.quotationId;
          if (quotationId) {
            const adoption = await adoptLalamoveOrder(dbPool, cancelLalamoveOrder, {
              lalamoveOrderId: orderId,
              quotationId,
              shareLink: order?.shareLink,
            });
            console.log(
              `[Lalamove Webhook] Unknown order ${orderId} (quotation ${quotationId}): ${adoption.result}`,
            );
            [orderRows] = await findByOrderId();
          }
        }

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
                 raw_webhook_payload = ?
             WHERE lalamove_order_id = ?`,
            [
              driverName,
              driverPhone,
              driverPlate,
              JSON.stringify(payload),
              orderId,
            ],
          );

          // 若為單純 DRIVER_ASSIGNED（無 status 變更），也記錄至 audit events
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
        //    守衛一：狀態機，只有合法前置狀態可轉移
        //    守衛二：事件時間，Lalamove 不保證送達順序（官方要求依 timestamp 排序），
        //           比已套用事件更舊的事件丟棄 —— 否則允許「退回 ASSIGNING_DRIVER」後，
        //           晚到的舊 ASSIGNING_DRIVER 會把 ON_GOING 蓋回去
        if (dbStatus) {
          //* 守衛（狀態機、事件時間）、稽核、退款由 DeliveryOrder module 負責；推播在下面合併司機與座標
          const transition = await transitionDeliveryOrder(
            dbPool,
            { lalamoveOrderId: orderId },
            dbStatus,
            {
              source: "lalamove_webhook",
              eventTime: getWebhookEventTime(payload),
              eventId: payload.eventId || null,
              payload,
              failureReason: lalamoveFailureReason(dbStatus, rawStatus),
            },
          );
          statusApplied = transition.applied;
          if (!statusApplied) {
            console.warn(
              `[Lalamove Webhook] Ignored ${dbStatus} for order ${orderId}: invalid transition or stale event`,
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

        if (dbStatus && statusApplied) {
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

      //* 與真實事件同一條轉移（守衛、稽核、推播）
      await transitionDeliveryOrder(dbPool, { lalamoveOrderId: orderId }, "ON_GOING", {
        source: "sandbox",
        payload: { source: "sandbox", status: "ON_GOING" },
        io: res.locals.io || req.app.get("io") || null,
      });

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

      //* 與真實事件同一條轉移（守衛、稽核、推播）
      await transitionDeliveryOrder(dbPool, { lalamoveOrderId: orderId }, "PICKED_UP", {
        source: "sandbox",
        payload: { source: "sandbox", status: "PICKED_UP" },
        io: res.locals.io || req.app.get("io") || null,
      });

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

      //* 與真實事件同一條轉移（守衛、稽核、推播）
      await transitionDeliveryOrder(dbPool, { lalamoveOrderId: orderId }, "COMPLETED", {
        source: "sandbox",
        payload: { source: "sandbox", status: "COMPLETED" },
        io: res.locals.io || req.app.get("io") || null,
      });

      res.json({ success: true, result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sandbox error";
      console.error("[Sandbox] deliver error:", error);
      res.status(500).json({ error: "Sandbox deliver failed", message });
    }
  },
);

export default router;
