import { Router, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { PaymentService } from "./services/payment/paymentService";
import { createPaymentService } from "./services/payment/defaultPaymentService";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2/promise";

import { locationService } from "./services/locationService";

// 地點可以用已存在的 ID（後端 locations 表），或在結帳時即時傳入地址物件（後端自動建立）
const LocationByIdSchema = z.object({ locationId: z.number().int().positive() });
const LocationByDataSchema = z.object({
  fullAddress: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  placeId: z.string().optional(),
  name: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  route: z.string().optional(),
  zipCode: z.string().optional(),
  zip: z.string().optional(),
  url: z.string().optional(),
});

const CheckoutSchema = z.object({
  postId: z.number().int().positive(),
  serviceType: z.string().min(1, "serviceType is required"),
  quotationId: z.string().min(1, "quotationId is required"),
  feeTotal: z.number().int().positive("feeTotal must be a positive integer"),
  expiresAt: z.string().or(z.date()),
  // 取件地點：locationId 或 location 物件二擇一
  pickup: z.union([LocationByIdSchema, LocationByDataSchema]),
  pickupRemarks: z.string().max(255).optional(),
  // 送達地點：locationId 或 location 物件二擇一
  dropoff: z.union([LocationByIdSchema, LocationByDataSchema]),
  dropoffRemarks: z.string().max(255).optional(),
  senderName: z.string().min(1).max(100),
  senderPhone: z.string().min(1).max(50),
  recipientName: z.string().min(1).max(100),
  recipientPhone: z.string().min(1).max(50),
  simulatePaid: z.boolean().optional(),
});

export interface PaymentRouterOptions {
  paymentService?: PaymentService;
  authMiddleware?: RequestHandler;
}

type LocationInput =
  | z.infer<typeof LocationByIdSchema>
  | z.infer<typeof LocationByDataSchema>;

/**
 * 取得或建立地點 ID（透過 locationService 統一處理查重、補齊與插入）
 */
async function resolveLocationId(location: LocationInput): Promise<number> {
  if ("locationId" in location) {
    return location.locationId;
  }

  return locationService.findOrCreateLocation(dbPool, {
    place_id: location.placeId,
    name: location.name,
    full_address: location.fullAddress,
    province: location.province,
    city: location.city,
    route: location.route,
    zip_code: location.zipCode || location.zip,
    lat: location.lat,
    lng: location.lng,
    url: location.url,
  });
}

export function createPaymentRouter(options?: PaymentRouterOptions): Router {
  const router = Router();

  // 預設金流服務實例化 (若未傳入 mock)
  const paymentService = options?.paymentService || createPaymentService();

  const auth = options?.authMiddleware || (requireAuth as unknown as RequestHandler);

  /**
   * POST /api/payments/checkout
   * 建立結帳訂單並回傳綠界自動跳轉 Form
   */
  router.post("/checkout", auth, async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CheckoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }

      const authReq = req as unknown as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // 解析取件/送達地點 → 取得 locationId（必要時自動建立）
      const [pickupLocationId, dropoffLocationId] = await Promise.all([
        resolveLocationId(parsed.data.pickup),
        resolveLocationId(parsed.data.dropoff),
      ]);

      const session = await paymentService.createCheckoutOrder({
        userId,
        postId: parsed.data.postId,
        serviceType: parsed.data.serviceType,
        quotationId: parsed.data.quotationId,
        feeTotal: parsed.data.feeTotal,
        expiresAt: new Date(parsed.data.expiresAt),
        pickupLocationId,
        pickupRemarks: parsed.data.pickupRemarks,
        dropoffLocationId,
        dropoffRemarks: parsed.data.dropoffRemarks,
        senderName: parsed.data.senderName,
        senderPhone: parsed.data.senderPhone,
        recipientName: parsed.data.recipientName,
        recipientPhone: parsed.data.recipientPhone,
        simulatePaid: parsed.data.simulatePaid,
      });

      res.json({
        success: true,
        session,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "結帳建立失敗";
      res.status(400).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/payments/status/:merchantTradeNo
   * 查詢資料庫真實付款與外送派單狀態（防止前端竄改，並取得 lalamoveOrderId）
   */
  router.get("/status/:merchantTradeNo", auth, async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const merchantTradeNo = req.params.merchantTradeNo;
      if (!merchantTradeNo) {
        res.status(400).json({ error: "merchantTradeNo is required" });
        return;
      }

      const [rows] = await dbPool.query<RowDataPacket[]>(
        `SELECT 
           p.id as payment_id,
           p.status as payment_status,
           p.amount,
           p.rtn_code,
           p.rtn_msg,
           p.payment_date,
           d.id as delivery_order_id,
           d.status as delivery_status,
           d.lalamove_order_id
         FROM payments p
         LEFT JOIN delivery_orders d ON d.payment_id = p.id
         WHERE p.merchant_trade_no = ? AND p.user_id = ?`,
        [merchantTradeNo, userId]
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({ error: "Payment record not found" });
        return;
      }

      const record = rows[0];
      res.json({
        success: true,
        isPaid: record.payment_status === "PAID",
        paymentStatus: record.payment_status,
        deliveryStatus: record.delivery_status,
        outcome: derivePaymentOutcome(
          record.payment_status,
          record.delivery_status,
          record.lalamove_order_id
        ),
        amount: Number(record.amount),
        lalamoveOrderId: record.lalamove_order_id || null,
        rtnMsg: record.rtn_msg,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "查詢失敗";
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/payments/ecpay/order-result
   * 綠界前端 Form POST 瀏覽器跳轉端點 (OrderResultURL)
   * 消費者在綠界刷卡完成後，綠界會自動以 Form POST 將消費者瀏覽器導向此處
   */
  router.post("/ecpay/order-result", (req: Request, res: Response): void => {
    const payload = req.body as Record<string, string>;
    const rtnCode = payload.RtnCode || "0";
    const rtnMsg = encodeURIComponent(payload.RtnMsg || "");
    const merchantTradeNo = encodeURIComponent(payload.MerchantTradeNo || "");
    const clientHost =
      process.env.NEXT_PUBLIC_CLIENT_URL ||
      process.env.CORS_ORIGINS?.split(",")[0] ||
      "https://localhost:3000";

    res.redirect(
      303,
      `${clientHost}/delivery/payment-result?RtnCode=${rtnCode}&MerchantTradeNo=${merchantTradeNo}&RtnMsg=${rtnMsg}`
    );
  });

  /**
   * POST /api/payments/ecpay/callback
   * 綠界 Server-to-Server 背景 Webhook (ReturnURL)
   * 只有處理成功（PROCESSED）或已處理過（IGNORED）才回 "1|OK"；
   * 處理中丟錯（例如 DB 斷線導致交易 rollback）回 500，讓綠界稍後重送（當天最多 4 次）。
   * 閘門是冪等的，重送多少次都安全。
   */
  router.post("/ecpay/callback", async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as Record<string, string>;
    try {
      const result = await paymentService.handlePaymentCallback(payload);
      console.log(
        `[ECPay Callback] ${payload.MerchantTradeNo}: ${result.status} - ${result.message}`
      );
      if (result.status === "FAILED") {
        res.status(400).send(`0|${result.message}`);
        return;
      }
      res.status(200).send("1|OK");
    } catch (err) {
      console.error(`Error processing ECPay callback ${payload?.MerchantTradeNo}:`, err);
      res.status(500).send("0|Internal Error");
    }
  });

  return router;
}

export default createPaymentRouter();

/** 結果頁要呈現給使用者的狀態（由付款 + 外送單狀態推導，前端不自行判斷） */
export type PaymentOutcome =
  | "AWAITING_PAYMENT" // 尚未收到綠界付款結果
  | "PAYMENT_FAILED" // 付款失敗 / 已取消
  | "PLACING" // 已付款，正在向 Lalamove 叫車（含結果不明的等待期）
  | "DISPATCHED" // 已建立 Lalamove 訂單
  | "REFUNDING" // 叫車失敗 / 訂單逾期，退款處理中
  | "REFUNDED"; // 已退款

export function derivePaymentOutcome(
  paymentStatus: string,
  deliveryStatus: string | null,
  lalamoveOrderId: string | null
): PaymentOutcome {
  if (paymentStatus === "REFUNDED" || paymentStatus === "PARTIAL_REFUNDED") return "REFUNDED";
  if (paymentStatus === "PAID") {
    // 外送單已終止（含已取消的孤兒 Lalamove 單）優先於 lalamove_order_id 判斷
    if (deliveryStatus === "FAILED" || deliveryStatus === "EXPIRED") return "REFUNDING";
    if (lalamoveOrderId) return "DISPATCHED";
    return "PLACING";
  }
  if (paymentStatus === "PENDING") return "AWAITING_PAYMENT";
  return "PAYMENT_FAILED";
}
