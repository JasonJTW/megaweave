import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import crypto from "crypto";
import {
  IPaymentProvider,
  PaymentSessionResult,
} from "./types";
import { CreateOrderParams } from "../lalamove";

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

export interface PaymentServiceDependencies {
  dbPool: Pool;
  provider: IPaymentProvider;
  lalamoveService?: {
    createLalamoveOrder: (params: CreateOrderParams) => Promise<LalamoveOrderResult>;
  };
}

export interface DeliveryOrderRow extends RowDataPacket {
  id: number;
  payment_id: number;
  quotation_id: string;
  sender_name: string;
  sender_phone: string;
  recipient_name: string;
  recipient_phone: string;
}

export class PaymentService {
  private dbPool: Pool;
  private provider: IPaymentProvider;
  private lalamoveService?: {
    createLalamoveOrder: (params: CreateOrderParams) => Promise<LalamoveOrderResult>;
  };

  constructor(deps: PaymentServiceDependencies) {
    this.dbPool = deps.dbPool;
    this.provider = deps.provider;
    this.lalamoveService = deps.lalamoveService;
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
         WHERE post_id = ? AND status = 'pending' AND (giver_id = ? OR receiver_id = ?)
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

    // 2. 進入原子冪等閘門：只有 PENDING 的訂單能轉為 PAID
    const conn = await this.dbPool.getConnection();
    let deliveryOrder: DeliveryOrderRow | null = null;
    let paymentId: number | null = null;

    try {
      await conn.beginTransaction();

      const [updateResult] = await conn.query<ResultSetHeader>(
        `UPDATE payments 
         SET status = 'PAID', trade_no = ?, payment_date = ?, rtn_code = ?, rtn_msg = ?, 
             simulated_paid = ?, raw_callback_payload = ?, processed_at = NOW() 
         WHERE merchant_trade_no = ? AND status = 'PENDING'`,
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

      // 若 affectedRows === 0 代表該筆已處理過，或非 PENDING 狀態
      if (updateResult.affectedRows === 0) {
        await conn.commit();
        return { status: "IGNORED", message: "Duplicate or invalid payment callback" };
      }

      // 查詢對應的外送訂單
      const [orderRows] = await conn.query<DeliveryOrderRow[]>(
        `SELECT d.*, p.id as payment_id 
         FROM delivery_orders d 
         JOIN payments p ON d.payment_id = p.id 
         WHERE p.merchant_trade_no = ?`,
        [callbackResult.merchantTradeNo]
      );

      if (orderRows && orderRows.length > 0) {
        deliveryOrder = orderRows[0];
        paymentId = deliveryOrder.payment_id;

        // 標記外送訂單正在向 Lalamove 派單
        await conn.query(
          "UPDATE delivery_orders SET status = 'ORDER_PLACING' WHERE id = ?",
          [deliveryOrder.id]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // 3. 觸發 Lalamove 建立訂單
    if (deliveryOrder && this.lalamoveService) {
      try {
        const orderParams: CreateOrderParams = {
          quotationId: deliveryOrder.quotation_id,
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
        };

        const lalaResult = await this.lalamoveService.createLalamoveOrder(orderParams);

        // 更新外送訂單狀態為 ASSIGNING_DRIVER 並記錄司機與 share_link
        await this.dbPool.query(
          `UPDATE delivery_orders 
           SET status = 'ASSIGNING_DRIVER', lalamove_order_id = ?, share_link = ?, 
               driver_name = ?, driver_phone = ?, driver_plate_number = ?, 
               version = version + 1 
           WHERE id = ?`,
          [
            lalaResult.orderId || null,
            lalaResult.shareLink || null,
            lalaResult.driverDetails?.name || null,
            lalaResult.driverDetails?.phone || null,
            lalaResult.driverDetails?.plateNumber || null,
            deliveryOrder.id,
          ]
        );

        // 記錄事件
        await this.dbPool.query(
          `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload) 
           VALUES (?, 'ASSIGNING_DRIVER', ?)`,
          [deliveryOrder.id, JSON.stringify(lalaResult)]
        );
      } catch (lalaErr: unknown) {
        // Lalamove 建單失敗（例如報價過期）
        const reason = lalaErr instanceof Error ? lalaErr.message : "Lalamove dispatch failed";

        await this.dbPool.query(
          `UPDATE delivery_orders 
           SET status = 'FAILED', failure_reason = ?, version = version + 1 
           WHERE id = ?`,
          [reason, deliveryOrder.id]
        );

        await this.dbPool.query(
          `INSERT INTO delivery_order_events (delivery_order_id, event_status, raw_payload) 
           VALUES (?, 'FAILED', ?)`,
          [deliveryOrder.id, JSON.stringify({ error: reason })]
        );

        // 執行自動退款
        if (paymentId) {
          try {
            await this.refund(paymentId, `AUTO_REFUND: ${reason}`);
          } catch (refundErr) {
            console.error("Auto-refund failed after Lalamove dispatch error:", refundErr);
          }
        }
      }
    }

    return { status: "PROCESSED", message: "Payment processed and order dispatched" };
  }

  /**
   * 執行信用卡退款（含防爆上限檢核）
   */
  async refund(
    paymentId: number,
    reason: string,
    refundAmount?: number
  ): Promise<boolean> {
    // 1. 查詢原始付款資料
    const [paymentRows] = await this.dbPool.query<RowDataPacket[]>(
      "SELECT id, merchant_trade_no, trade_no, amount, status FROM payments WHERE id = ?",
      [paymentId]
    );
    if (!paymentRows || paymentRows.length === 0) {
      throw new Error(`Payment not found for ID: ${paymentId}`);
    }
    const payment = paymentRows[0];
    const targetRefundAmount = refundAmount || payment.amount;

    // 2. 檢核累積退款金額不超過付款總額
    const [refundSumRows] = await this.dbPool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(refund_amount), 0) AS total_refunded 
       FROM payment_refunds 
       WHERE payment_id = ? AND status = 'SUCCESS'`,
      [paymentId]
    );
    const alreadyRefunded = Number(refundSumRows[0].total_refunded || 0);
    if (alreadyRefunded + targetRefundAmount > payment.amount) {
      throw new Error(
        `Refund amount (${targetRefundAmount}) exceeds remaining refundable balance (${
          payment.amount - alreadyRefunded
        })`
      );
    }

    const merchantRefundNo = `REF${Date.now()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    // 3. 呼叫金流 Provider 進行刷退
    const refundResult = await this.provider.refundPayment({
      merchantTradeNo: payment.merchant_trade_no,
      tradeNo: payment.trade_no,
      amount: targetRefundAmount,
      reason,
    });

    const isSuccess = refundResult.isSuccess;

    // 4. 寫入 payment_refunds
    await this.dbPool.query(
      `INSERT INTO payment_refunds (
        payment_id, merchant_refund_no, refund_amount, reason, status, provider_refund_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        merchantRefundNo,
        targetRefundAmount,
        reason,
        isSuccess ? "SUCCESS" : "FAILED",
        refundResult.refundId || null,
      ]
    );

    // 5. 更新 payments 狀態
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
