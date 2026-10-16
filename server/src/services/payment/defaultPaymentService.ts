// server/src/services/payment/defaultPaymentService.ts
// 正式環境的 PaymentService 組裝（ECPay + Lalamove），供 payments route 與退款 worker 共用

import dbPool from "../../utils/db";
import { requireEnv } from "../../utils/env";
import { enqueueDeliveryRefund, enqueueDispatchCheck } from "../../queue/queues";
import { notifyDeliveryUser } from "../deliveryNotifier";
import * as lalamoveService from "../lalamove";
import { ECPayAioProvider } from "./ecpay/ECPayAioProvider";
import { PaymentService } from "./paymentService";

// hashKey/hashIV 是驗證綠界回調真偽的唯一憑據，絕不可有預設值：
// 退回綠界公開的測試金鑰會讓任何人都能偽造「付款成功」回調。
export function createPaymentService(): PaymentService {
  return new PaymentService({
    dbPool,
    provider: new ECPayAioProvider({
      merchantId: requireEnv("ECPAY_MERCHANT_ID", "payments"),
      hashKey: requireEnv("ECPAY_HASH_KEY", "payments"),
      hashIV: requireEnv("ECPAY_HASH_IV", "payments"),
      host: requireEnv("ECPAY_HOST", "payments"),
      returnUrl: process.env.ECPAY_RETURN_URL,
      clientBackUrl: process.env.ECPAY_CLIENT_BACK_URL,
      orderResultUrl: process.env.ECPAY_ORDER_RESULT_URL,
    }),
    lalamoveService,
    enqueueDeliveryRefund,
    scheduleDispatchCheck: enqueueDispatchCheck,
    notifyDeliveryUser,
  });
}
