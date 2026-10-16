import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "crypto";
import {
  IPaymentProvider,
  PaymentSessionResult,
  RefundPaymentResult,
} from "./types";
import { CreateOrderParams, GetQuotationParams } from "../lalamove";
import { predecessorsOf } from "../deliveryStatus";
import { cancelOrphanLalamoveOrder } from "../deliveryRecovery";
import { LalamoveDispatchError } from "../lalamoveErrors";
import type { DeliveryNoticeEvent } from "../deliveryNotifier";

export interface CreateCheckoutOrderInput {
  userId: number;
  postId: number;
  serviceType: string;
  quotationId: string;
  feeTotal: number;
  expiresAt: Date;
  pickupLocationId: number;
  pickupRemarks?: string;
  dropoffLocationId: number;
  dropoffRemarks?: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  simulatePaid?: boolean;
}

export interface LalamoveOrderResult {
  orderId?: string;
  shareLink?: string;
  driverDetails?: {
    name?: string;
    phone?: string;
    plateNumber?: string;
  };
}

export interface LalamoveRequoteResult {
  quotationId: string;
  expiresAt: string;
  priceBreakdown: { total: string };
}

export interface LalamoveServiceDeps {
  createLalamoveOrder: (params: CreateOrderParams) => Promise<LalamoveOrderResult>;
  requestLalamoveQuotation?: (params: GetQuotationParams) => Promise<LalamoveRequoteResult>;
  cancelLalamoveOrder?: (orderId: string) => Promise<unknown>;
}

export interface PaymentServiceDependencies {
  dbPool: Pool;
  provider: IPaymentProvider;
  lalamoveService?: LalamoveServiceDeps;
  /** 排入自動退款佇列（BullMQ 重試）；由 deliveryRefund worker 確認狀態後呼叫 refund() */
  enqueueDeliveryRefund: (data: { deliveryOrderId: number; reason: string }) => Promise<void>;
  /** 排定單筆外送單的派單檢查（延遲 job），由 worker 呼叫 checkPlacingOrder() */
  scheduleDispatchCheck: (
    deliveryOrderId: number,
    delayMs: number,
    stage: "initial" | "final"
  ) => Promise<void>;
  /** 通知使用者叫車失敗 / 退款結果（站內 + Email），盡力而為 */
  notifyDeliveryUser: (deliveryOrderId: number, event: DeliveryNoticeEvent) => Promise<void>;
}

export type DispatchOutcome =
  | "DISPATCHED" // T2 成功（T3 已寫回或交由 webhook 認領）
  | "FAILED" // 確定未建單 → FAILED + 退款
  | "UNKNOWN" // T2 結果不明 → 維持 ORDER_PLACING 等 webhook 認領
  | "NOT_CLAIMED"; // 已由他方送出 T2，或外送單已離開 ORDER_PLACING

export type PlacingCheckResult = "NOOP" | "WAITING" | "FAILED" | DispatchOutcome;

/** 付款後多久檢查一次派單是否完成（T2 逾時 30 秒，60 秒時必已結束） */
export const DISPATCH_CHECK_DELAY_MS = 60 * 1000;

/** T2 結果不明時，等 ORDER_CREATED webhook 認領的時間；期滿仍無則判定未建單並退款 */
export const DISPATCH_OUTCOME_WAIT_MINUTES = 5;

// 報價剩餘有效時間低於此值即視為過期，避免送到 Lalamove 時剛好失效
const QUOTATION_SAFETY_MARGIN_MS = 30 * 1000;

// T3（派單結果寫回 DB）的重試間隔；用完仍失敗則交給 Lalamove ORDER_CREATED webhook 認領
const RECORD_DISPATCH_RETRY_DELAYS_MS = [200, 1000, 3000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DeliveryOrderRow extends RowDataPacket {
  id: number;
  payment_id: number;
  quotation_id: string;
  expires_at: Date;
  fee_total: number | string;
  service_type: string;
  pickup_location_id: number;
  pickup_address_snapshot: string;
  dropoff_location_id: number;
  dropoff_address_snapshot: string;
  sender_name: string;
  sender_phone: string;
  recipient_name: string;
  recipient_phone: string;
}

export class PaymentService {
  private dbPool: Pool;
  private provider: IPaymentProvider;
  private lalamoveService?: LalamoveServiceDeps;
  private enqueueDeliveryRefund: PaymentServiceDependencies["enqueueDeliveryRefund"];
  private scheduleDispatchCheck: PaymentServiceDependencies["scheduleDispatchCheck"];
  private notifyDeliveryUser: PaymentServiceDependencies["notifyDeliveryUser"];

  constructor(deps: PaymentServiceDependencies) {
    this.dbPool = deps.dbPool;
    this.provider = deps.provider;
    this.lalamoveService = deps.lalamoveService;
    this.enqueueDeliveryRefund = deps.enqueueDeliveryRefund;
    this.scheduleDispatchCheck = deps.scheduleDispatchCheck;
    this.notifyDeliveryUser = deps.notifyDeliveryUser;
  }

  /**
   * 產生綠界 20 碼以內的唯一 MerchantTradeNo
   * 規則: MW + 10碼 timestamp + 6碼隨機英數字 = 18碼 (符合 <= 20 碼硬限制)
   */
  private generateMerchantTradeNo(): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `MW${timestamp}${randomHex}`;
  }

  /**
   * 建立結帳訂單（原子交易插入 payments 與 delivery_orders）並產出金流表單
   */
  async createCheckoutOrder(
    input: CreateCheckoutOrderInput
  ): Promise<PaymentSessionResult> {
    // 1. 檢查報價是否過期
    if (new Date() >= new Date(input.expiresAt)) {
      throw new Error("Lalamove quotation has expired. Please request a new quote.");
    }

    // 2. 查詢地點資料庫取得下單當下之地址文字快照
    const [pickupRows] = await this.dbPool.query<RowDataPacket[]>(
      "SELECT id, full_address, lat, lng FROM locations WHERE id = ?",
      [input.pickupLocationId]
    );
    if (!pickupRows || pickupRows.length === 0) {
      throw new Error(`Pickup location not found for ID: ${input.pickupLocationId}`);
    }
    const pickupAddressSnapshot = pickupRows[0].full_address;

    const [dropoffRows] = await this.dbPool.query<RowDataPacket[]>(
      "SELECT id, full_address, lat, lng FROM locations WHERE id = ?",
      [input.dropoffLocationId]
    );
    if (!dropoffRows || dropoffRows.length === 0) {
      throw new Error(`Dropoff location not found for ID: ${input.dropoffLocationId}`);
    }
    const dropoffAddressSnapshot = dropoffRows[0].full_address;

    const merchantTradeNo = this.generateMerchantTradeNo();

    // 3. 開啟 DB Transaction 進行雙表原子插入
    const conn: PoolConnection = await this.dbPool.getConnection();
    try {
      await conn.beginTransaction();

      // 必須是該貼文某筆 pending weave 的 giver 或 receiver 才能叫車（鎖定該 weave 列避免同時被取消/完成）
      const [pendingWeaveRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM weaves
         WHERE post_id = ? AND status = 'approved' AND (giver_id = ? OR receiver_id = ?)
         LIMIT 1 FOR UPDATE`,
        [input.postId, input.userId, input.userId]
      );
      if (!pendingWeaveRows || pendingWeaveRows.length === 0) {
        throw new Error("A pending weave for this post is required to book Lalamove delivery.");
      }

      // 插入 payments 表
      const [paymentResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO payments (
          user_id, merchant_trade_no, provider, payment_method, amount, currency, status, simulated_paid
        ) VALUES (?, ?, ?, 'Credit', ?, 'TWD', 'PENDING', ?)`,
        [
          input.userId,
          merchantTradeNo,
          this.provider.providerName,
          input.feeTotal,
          input.simulatePaid ? 1 : 0,
        ]
      );
      const paymentId = paymentResult.insertId;

      // 插入 delivery_orders 表 (含地址快照與 FK)
      await conn.query<ResultSetHeader>(
        `INSERT INTO delivery_orders (
          user_id, payment_id, post_id,
          pickup_location_id, pickup_address_snapshot, pickup_remarks,
          dropoff_location_id, dropoff_address_snapshot, dropoff_remarks,
          sender_name, sender_phone, recipient_name, recipient_phone,
          service_type, quotation_id, fee_total, expires_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_PENDING')`,
        [
          input.userId,
          paymentId,
          input.postId,
          input.pickupLocationId,
          pickupAddressSnapshot,
          input.pickupRemarks || null,
          input.dropoffLocationId,
          dropoffAddressSnapshot,
          input.dropoffRemarks || null,
          input.senderName,
          input.senderPhone,
          input.recipientName,
          input.recipientPhone,
          input.serviceType,
          input.quotationId,
          input.feeTotal,
          input.expiresAt,
        ]
      );

      await conn.commit();

      // 4. 呼叫金流 Provider 產生付款 Session
      const session = await this.provider.createPaymentSession({
        merchantTradeNo,
        amount: input.feeTotal,
        itemDescription: `Lalamove 運費 (${input.serviceType})`,
        tradeDate: new Date(),
        simulatePaid: input.simulatePaid,
      });

      return session;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 處理金流 Webhook 回呼（原子冪等閘門防護 + 觸發 Lalamove 派單與自動刷退）
   */
  async handlePaymentCallback(
    rawPayload: Record<string, string>
  ): Promise<{ status: "PROCESSED" | "IGNORED" | "FAILED"; message: string }> {
    // 1. 驗證金流簽名 (CheckMacValue)
    const callbackResult = await this.provider.verifyAndParseCallback(rawPayload);
    if (!callbackResult.isValid) {
      return { status: "FAILED", message: "Invalid payment signature" };
    }

    if (!callbackResult.isSuccess) {
      // 標記付款失敗
      await this.dbPool.query(
        `UPDATE payments 
         SET status = 'FAILED', rtn_code = ?, rtn_msg = ?, raw_callback_payload = ?, processed_at = NOW() 
         WHERE merchant_trade_no = ? AND status = 'PENDING'`,
        [
          callbackResult.rtnCode,
          callbackResult.rtnMsg,
          JSON.stringify(rawPayload),
          callbackResult.merchantTradeNo,
        ]
      );
      return { status: "PROCESSED", message: "Payment failed marked" };
    }

    // 2. 進入原子冪等閘門：只有尚未入帳（PENDING / FAILED / CANCELLED）的付款能轉為 PAID
    //    - FAILED：同一筆交易先刷失敗、再重刷成功
    //    - CANCELLED：對帳已關閉付款窗口後才付款成功（綠界付款頁不受我們控制）
    //      → 外送單已 EXPIRED，下方 ORDER_PLACING 守衛會擋下並自動退款，錢不會被吞掉
    //    已 PAID / REFUNDED 者 affectedRows = 0 → 視為重複通知
    const conn = await this.dbPool.getConnection();
    let deliveryOrderId: number | null = null;
    let undispatchableReason: string | null = null;

    try {
      await conn.beginTransaction();

      const [updateResult] = await conn.query<ResultSetHeader>(
        `UPDATE payments 
         SET status = 'PAID', trade_no = ?, payment_date = ?, rtn_code = ?, rtn_msg = ?, 
             simulated_paid = ?, raw_callback_payload = ?, processed_at = NOW() 
         WHERE merchant_trade_no = ? AND status IN ('PENDING', 'FAILED', 'CANCELLED')`,
        [
          callbackResult.tradeNo,
          callbackResult.paymentDate || new Date(),
          callbackResult.rtnCode,
          callbackResult.rtnMsg,
          callbackResult.simulatedPaid ? 1 : 0,
          JSON.stringify(rawPayload),
          callbackResult.merchantTradeNo,
        ]
      );

      // 若 affectedRows === 0 代表該筆已入帳（PAID / 已退款），或查無此單
      if (updateResult.affectedRows === 0) {
        await conn.commit();
        return { status: "IGNORED", message: "Duplicate or invalid payment callback" };
      }

      // 查詢對應的外送訂單
      const [orderRows] = await conn.query<RowDataPacket[]>(
        `SELECT d.id 
         FROM delivery_orders d 
         JOIN payments p ON d.payment_id = p.id 
         WHERE p.merchant_trade_no = ?`,
        [callbackResult.merchantTradeNo]
      );

      if (orderRows && orderRows.length > 0) {
        deliveryOrderId = Number(orderRows[0].id);

        // 標記外送訂單正在向 Lalamove 派單（狀態機守衛：僅 PAYMENT_PENDING 可轉移）
        const [placingResult] = await conn.query<ResultSetHeader>(
          "UPDATE delivery_orders SET status = 'ORDER_PLACING' WHERE id = ? AND status IN (?)",
          [deliveryOrderId, predecessorsOf("ORDER_PLACING")]
        );

        // 付款到達前外送單已過期 / 取消（付款窗口已關）→ 不派單，改為自動退款
        if (placingResult.affectedRows === 0) {
          undispatchableReason = `Delivery order ${deliveryOrderId} is no longer awaiting payment`;
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    if (undispatchableReason && deliveryOrderId) {
      console.warn(
        `[ALERT] Late payment ${callbackResult.merchantTradeNo} (TradeNo ${callbackResult.tradeNo}): ${undispatchableReason}; auto-refunding`
      );
      await this.notifyDeliveryUser(deliveryOrderId, "PAID_AFTER_ORDER_CLOSED");
      await this.enqueueDeliveryRefund({ deliveryOrderId, reason: "PAID_AFTER_ORDER_CLOSED" });
      return { status: "PROCESSED", message: "Payment refunded: delivery order no longer payable" };
    }

    if (!deliveryOrderId) {
      return { status: "PROCESSED", message: "Payment processed (no delivery order)" };
    }

    // 3. 派單 saga（T1 收款已 commit）。先排定 60 秒後的檢查：本程序若在 T2 前後當機，由 worker 接手
    try {
      await this.scheduleDispatchCheck(deliveryOrderId, DISPATCH_CHECK_DELAY_MS, "initial");
    } catch (scheduleErr) {
      // 排程失敗時由對帳 cron（Phase 0）兜底
      console.error(`Failed to schedule dispatch check for delivery order ${deliveryOrderId}:`, scheduleErr);
    }

    const outcome = await this.dispatchDeliveryOrder(deliveryOrderId);
    return { status: "PROCESSED", message: `Payment processed; dispatch ${outcome}` };
  }

  /**
   * 派單 saga：claim → T2 Lalamove 建單（pivot）→ T3 寫回 DB（retryable）
   *
   * claim：送出 T2 前先寫 dispatch_attempted_at（狀態守衛，僅一方能送出）。
   *        之後若結果不明，代表 Lalamove「可能」已建單 —— 不可重送、不可退款，只能等 webhook 認領。
   * T2 失敗：Lalamove 明確拒絕（4xx）或重估價失敗 → 確定未建單 → FAILED + 退款
   *          網路錯誤 / 逾時 / 5xx → UNKNOWN，維持 ORDER_PLACING
   */
  async dispatchDeliveryOrder(deliveryOrderId: number): Promise<DispatchOutcome> {
    if (!this.lalamoveService) {
      throw new Error("Lalamove service is not configured");
    }

    const [claimResult] = await this.dbPool.query<ResultSetHeader>(
      `UPDATE delivery_orders SET dispatch_attempted_at = NOW(3) 
       WHERE id = ? AND status = 'ORDER_PLACING' AND dispatch_attempted_at IS NULL`,
      [deliveryOrderId]
    );
    if (claimResult.affectedRows === 0) return "NOT_CLAIMED";

    const [orderRows] = await this.dbPool.query<DeliveryOrderRow[]>(
      "SELECT * FROM delivery_orders WHERE id = ?",
      [deliveryOrderId]
    );
    const deliveryOrder = orderRows[0];

    let lalaResult: LalamoveOrderResult;
    try {
      // 付款完成時報價可能已過期（使用者在綠界付款頁停留過久）→ 重新報價（無副作用，失敗即確定未建單）
      const quotationId = this.isQuotationExpired(deliveryOrder.expires_at)
        ? await this.requoteDeliveryOrder(deliveryOrder)
        : deliveryOrder.quotation_id;

      const orderParams: CreateOrderParams = {
        quotationId,
        sender: {
          name: deliveryOrder.sender_name,
          phone: deliveryOrder.sender_phone,
        },
        recipients: [
          {
            name: deliveryOrder.recipient_name,
            phone: deliveryOrder.recipient_phone,
          },
        ],
        metadata: { deliveryOrderId: String(deliveryOrderId) },
      };

      lalaResult = await this.lalamoveService.createLalamoveOrder(orderParams);
    } catch (lalaErr: unknown) {
      const reason = lalaErr instanceof Error ? lalaErr.message : "Lalamove dispatch failed";

      if (lalaErr instanceof LalamoveDispatchError && lalaErr.outcome === "UNKNOWN") {
        console.warn(
          `[ALERT] Lalamove dispatch outcome unknown for delivery order ${deliveryOrderId} (${reason}); awaiting ORDER_CREATED webhook for up to ${DISPATCH_OUTCOME_WAIT_MINUTES} min`
        );
        return "UNKNOWN";
      }

      await this.failDispatch(deliveryOrderId, reason);
      return "FAILED";
    }

    await this.recordDispatch(deliveryOrderId, lalaResult);
    return "DISPATCHED";
  }

  /**
   * 檢查仍在 ORDER_PLACING 的外送單（延遲 job 與對帳 cron 共用）：
   * - 從未送出 T2（dispatch_attempted_at 為 NULL）→ 確定沒有 Lalamove 單 → 重新派單
   * - 已送出且等待期滿仍未被 webhook 認領 → 判定未建單 → FAILED + 退款 + 告警
   * - 已送出但等待期未滿 → 排定期滿時再檢查
   */
  async checkPlacingOrder(deliveryOrderId: number): Promise<PlacingCheckResult> {
    const [rows] = await this.dbPool.query<RowDataPacket[]>(
      `SELECT status, dispatch_attempted_at,
              TIMESTAMPDIFF(MICROSECOND, NOW(3), dispatch_attempted_at + INTERVAL ? MINUTE) DIV 1000 AS wait_remaining_ms
       FROM delivery_orders WHERE id = ?`,
      [DISPATCH_OUTCOME_WAIT_MINUTES, deliveryOrderId]
    );
    const row = rows[0];
    if (!row || row.status !== "ORDER_PLACING") return "NOOP";

    if (!row.dispatch_attempted_at) {
      console.warn(
        `[Dispatch Check] Delivery order ${deliveryOrderId} was paid but never dispatched; re-dispatching`
      );
      return this.dispatchDeliveryOrder(deliveryOrderId);
    }

    const remainingMs = Number(row.wait_remaining_ms);
    if (remainingMs > 0) {
      await this.scheduleDispatchCheck(deliveryOrderId, remainingMs + 1000, "final");
      return "WAITING";
    }

    console.warn(
      `[ALERT] Delivery order ${deliveryOrderId}: no Lalamove order surfaced within ${DISPATCH_OUTCOME_WAIT_MINUTES} min of an unknown dispatch outcome; failing and refunding`
    );
    await this.failDispatch(deliveryOrderId, "DISPATCH_OUTCOME_UNKNOWN");
    return "FAILED";
  }

  /**
   * T2 補償：外送單 ORDER_PLACING → FAILED、通知使用者並排入退款。
   * 以狀態守衛搶占，已被他方（逾時檢查、webhook 認領）處理過則不重複補償。
   */
  private async failDispatch(deliveryOrderId: number, reason: string): Promise<void> {
    const [failResult] = await this.dbPool.query<ResultSetHeader>(
      `UPDATE delivery_orders 
       SET status = 'FAILED', failure_reason = ? 
       WHERE id = ? AND status = 'ORDER_PLACING'`,
      [reason, deliveryOrderId]
    );
    if (failResult.affectedRows === 0) return;

    try {
      await this.dbPool.query(
        `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload) 
         VALUES (?, 'FAILED', ?)`,
        [deliveryOrderId, JSON.stringify({ error: reason })]
      );
    } catch (eventErr) {
      console.error(`Failed to record FAILED event for delivery order ${deliveryOrderId}:`, eventErr);
    }

    await this.notifyDeliveryUser(deliveryOrderId, "DISPATCH_FAILED");
    await this.enqueueDeliveryRefund({ deliveryOrderId, reason: "LALAMOVE_DISPATCH_FAILED" });
  }

  /**
   * T3：把 Lalamove 建單結果寫回 DB，只重試不補償。
   * - 重試用完仍失敗：保留 ORDER_PLACING，由 ORDER_CREATED webhook 以 quotationId 認領
   * - 外送單已離開 ORDER_PLACING（逾時檢查已判定失敗並退款）：取消這張 Lalamove 單，與退款一致
   */
  private async recordDispatch(deliveryOrderId: number, lalaResult: LalamoveOrderResult): Promise<void> {
    const lalamoveOrderId = lalaResult.orderId || null;

    for (let attempt = 0; ; attempt++) {
      try {
        const [updateResult] = await this.dbPool.query<ResultSetHeader>(
          `UPDATE delivery_orders 
           SET status = 'ASSIGNING_DRIVER', lalamove_order_id = ?, share_link = ?, 
               driver_name = ?, driver_phone = ?, driver_plate_number = ?
           WHERE id = ? AND status = 'ORDER_PLACING'`,
          [
            lalamoveOrderId,
            lalaResult.shareLink || null,
            lalaResult.driverDetails?.name || null,
            lalaResult.driverDetails?.phone || null,
            lalaResult.driverDetails?.plateNumber || null,
            deliveryOrderId,
          ]
        );
        if (updateResult.affectedRows === 0) {
          await this.handleDispatchRecordConflict(deliveryOrderId, lalamoveOrderId);
          return;
        }
        break;
      } catch (dbErr) {
        if (attempt >= RECORD_DISPATCH_RETRY_DELAYS_MS.length) {
          console.error(
            `[ALERT] Lalamove order ${lalamoveOrderId} created for delivery order ${deliveryOrderId} but recording it failed; awaiting ORDER_CREATED webhook adoption`,
            dbErr
          );
          return;
        }
        await sleep(RECORD_DISPATCH_RETRY_DELAYS_MS[attempt]);
      }
    }

    try {
      await this.dbPool.query(
        `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload) 
         VALUES (?, 'ASSIGNING_DRIVER', ?)`,
        [deliveryOrderId, JSON.stringify(lalaResult)]
      );
    } catch (eventErr) {
      console.error(`Failed to record ASSIGNING_DRIVER event for delivery order ${deliveryOrderId}:`, eventErr);
    }
  }

  /** T3 狀態守衛未命中：已被 webhook 認領（同一張 Lalamove 單）則無事；否則為孤兒單，取消之 */
  private async handleDispatchRecordConflict(
    deliveryOrderId: number,
    lalamoveOrderId: string | null
  ): Promise<void> {
    const [rows] = await this.dbPool.query<RowDataPacket[]>(
      "SELECT status, lalamove_order_id FROM delivery_orders WHERE id = ?",
      [deliveryOrderId]
    );
    if (rows[0]?.lalamove_order_id === lalamoveOrderId) return;
    if (!lalamoveOrderId) return;

    await cancelOrphanLalamoveOrder(this.dbPool, this.lalamoveService?.cancelLalamoveOrder, {
      deliveryOrderId,
      lalamoveOrderId,
      reason: `delivery order left ORDER_PLACING (now ${rows[0]?.status}) before dispatch was recorded`,
    });
  }

  private isQuotationExpired(expiresAt: Date | string | null | undefined): boolean {
    if (!expiresAt) return true;
    return new Date(expiresAt).getTime() - Date.now() < QUOTATION_SAFETY_MARGIN_MS;
  }

  /**
   * 以相同起訖點與車型重新報價；新運費不得高於已付金額，否則丟錯交由呼叫端標記 FAILED 並退款
   * @returns 新的 quotationId
   */
  private async requoteDeliveryOrder(order: DeliveryOrderRow): Promise<string> {
    if (!this.lalamoveService?.requestLalamoveQuotation) {
      throw new Error("Quotation expired and re-quote is unavailable");
    }

    const [locationRows] = await this.dbPool.query<RowDataPacket[]>(
      "SELECT id, lat, lng FROM locations WHERE id IN (?, ?)",
      [order.pickup_location_id, order.dropoff_location_id]
    );
    const pickup = locationRows.find((r) => Number(r.id) === Number(order.pickup_location_id));
    const dropoff = locationRows.find((r) => Number(r.id) === Number(order.dropoff_location_id));
    if (!pickup || !dropoff) {
      throw new Error(`Locations not found for re-quoting delivery order ${order.id}`);
    }

    const quote = await this.lalamoveService.requestLalamoveQuotation({
      serviceType: order.service_type,
      stops: [
        { coordinates: { lat: pickup.lat, lng: pickup.lng }, address: order.pickup_address_snapshot },
        { coordinates: { lat: dropoff.lat, lng: dropoff.lng }, address: order.dropoff_address_snapshot },
      ],
    });

    const newFee = Number(quote.priceBreakdown.total);
    const paidFee = Number(order.fee_total);
    if (!Number.isFinite(newFee) || newFee > paidFee) {
      throw new Error(`Re-quoted fee ${quote.priceBreakdown.total} exceeds paid amount ${paidFee}`);
    }

    // 必須在建單前寫入新 quotationId：ORDER_CREATED webhook 以它認領孤兒單
    const [requoteResult] = await this.dbPool.query<ResultSetHeader>(
      `UPDATE delivery_orders SET quotation_id = ?, expires_at = ? 
       WHERE id = ? AND status = 'ORDER_PLACING'`,
      [quote.quotationId, new Date(quote.expiresAt), order.id]
    );
    if (requoteResult.affectedRows === 0) {
      throw new Error(`Delivery order ${order.id} left ORDER_PLACING during re-quote`);
    }

    return quote.quotationId;
  }

  /**
   * 執行信用卡退款（冪等、可重試）
   *
   * 1. 交易內鎖住 payments 列（FOR UPDATE），以 PENDING 列先「預留」退款額度後 commit
   *    → 併發的第二次呼叫會看到額度已被佔用而失敗，不會重複刷退
   * 2. 退款單號由 payment_id + 序號決定（UNIQUE），即使鎖失效也無法插入第二筆同序號
   * 3. 呼叫綠界；結果不明（逾時 / 斷線）時保留 PENDING 並告警，不自動重刷，避免重複退款
   */
  async refund(
    paymentId: number,
    reason: string,
    refundAmount?: number
  ): Promise<boolean> {
    let payment: RowDataPacket;
    let targetRefundAmount: number;
    let alreadyRefunded: number;
    let merchantRefundNo: string;
    let refundRowId: number;

    const conn = await this.dbPool.getConnection();
    try {
      await conn.beginTransaction();

      const [paymentRows] = await conn.query<RowDataPacket[]>(
        "SELECT id, merchant_trade_no, trade_no, amount, status FROM payments WHERE id = ? FOR UPDATE",
        [paymentId]
      );
      if (!paymentRows || paymentRows.length === 0) {
        throw new Error(`Payment not found for ID: ${paymentId}`);
      }
      payment = paymentRows[0];
      if (payment.status !== "PAID" && payment.status !== "PARTIAL_REFUNDED") {
        throw new Error(`Payment ${paymentId} is not refundable (status=${payment.status})`);
      }
      targetRefundAmount = refundAmount || payment.amount;

      // PENDING 視為已佔用額度（可能已在綠界端成功），避免重複刷退
      const [refundSumRows] = await conn.query<RowDataPacket[]>(
        `SELECT 
           COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN refund_amount END), 0) AS total_refunded,
           COALESCE(SUM(CASE WHEN status IN ('SUCCESS', 'PENDING') THEN refund_amount END), 0) AS total_reserved,
           COUNT(*) AS refund_count
         FROM payment_refunds 
         WHERE payment_id = ?`,
        [paymentId]
      );
      alreadyRefunded = Number(refundSumRows[0].total_refunded || 0);
      const alreadyReserved = Number(refundSumRows[0].total_reserved || 0);
      if (alreadyReserved + targetRefundAmount > payment.amount) {
        throw new Error(
          `Refund amount (${targetRefundAmount}) exceeds remaining refundable balance (${
            payment.amount - alreadyReserved
          })`
        );
      }

      merchantRefundNo = `RF${paymentId}-${Number(refundSumRows[0].refund_count || 0) + 1}`;
      const [insertResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO payment_refunds (
          payment_id, merchant_refund_no, refund_amount, reason, status
        ) VALUES (?, ?, ?, ?, 'PENDING')`,
        [paymentId, merchantRefundNo, targetRefundAmount, reason]
      );
      refundRowId = insertResult.insertId;

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    let refundResult: RefundPaymentResult;
    try {
      refundResult = await this.provider.refundPayment({
        merchantTradeNo: payment.merchant_trade_no,
        tradeNo: payment.trade_no,
        amount: targetRefundAmount,
        paymentAmount: Number(payment.amount),
        reason,
      });
    } catch (providerErr) {
      console.error(
        `[ALERT] Refund ${merchantRefundNo} for payment ${paymentId} has unknown outcome; left PENDING for manual check`,
        providerErr
      );
      throw providerErr;
    }

    const isSuccess = refundResult.isSuccess;
    if (!isSuccess) {
      console.error(
        `[ALERT] Refund ${merchantRefundNo} for payment ${paymentId} rejected by provider: rtnCode=${refundResult.rtnCode} rtnMsg=${refundResult.rtnMsg}`
      );
    }

    await this.dbPool.query(
      "UPDATE payment_refunds SET status = ?, provider_refund_id = ? WHERE id = ?",
      [isSuccess ? "SUCCESS" : "FAILED", refundResult.refundId || null, refundRowId]
    );

    if (isSuccess) {
      const newStatus =
        alreadyRefunded + targetRefundAmount >= payment.amount
          ? "REFUNDED"
          : "PARTIAL_REFUNDED";
      await this.dbPool.query("UPDATE payments SET status = ? WHERE id = ?", [
        newStatus,
        paymentId,
      ]);
    }

    return isSuccess;
  }
}
