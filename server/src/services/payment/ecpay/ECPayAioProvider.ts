import {
  IPaymentProvider,
  CreatePaymentSessionInput,
  PaymentSessionResult,
  ParsedCallbackResult,
  QueryPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from "../types";
import { generateCheckMacValue, verifyCheckMacValue } from "./cmv";

export interface ECPayConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  host: string; // e.g. https://payment-stage.ecpay.com.tw
  returnUrl?: string;
  clientBackUrl?: string;
  orderResultUrl?: string;
}

// 綠界 WAF 攔截關鍵字過濾規則
const WAF_KEYWORDS = /\b(echo|cmd|python|perl|ping|ftp|telnet|nmap|nc|chmod|kill|rm|ls|gcc|passwd|uname|finger|mail|xterm|traceroute|tracert|tftp|wget|curl|bash|cmd\.exe|net\.exe|nmap\.exe|nc\.exe|ftp\.exe|wsh\.exe|tclsh)\b/gi;

function sanitizeEcpayText(text: string, maxLength: number = 200): string {
  if (!text) return "";
  const sanitized = text.replace(WAF_KEYWORDS, "").replace(/\s+/g, " ").trim();
  return sanitized.slice(0, maxLength);
}

function formatDateToEcpay(date: Date): string {
  // ECPay 要求格式: yyyy/MM/dd HH:mm:ss (UTC+8)
  const d = new Date(date.getTime() + 8 * 60 * 60 * 1000); // 轉為 UTC+8
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const seconds = String(d.getUTCSeconds()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function parseEcpayDate(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  // 格式: 2026/03/01 12:05:00
  const normalized = dateStr.replace(/\//g, "-").replace(" ", "T") + "+08:00";
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export class ECPayAioProvider implements IPaymentProvider {
  readonly providerName = "ECPAY_AIO";
  private config: ECPayConfig;

  constructor(config: ECPayConfig) {
    this.config = config;
  }

  async createPaymentSession(
    input: CreatePaymentSessionInput
  ): Promise<PaymentSessionResult> {
    const tradeDate = input.tradeDate || new Date();
    const returnUrl = input.returnUrl || this.config.returnUrl || "";
    const clientBackUrl = input.clientBackUrl || this.config.clientBackUrl || "";
    const orderResultUrl = input.orderResultUrl || this.config.orderResultUrl || "";

    const itemName = sanitizeEcpayText(input.itemDescription || "外送訂單服務", 200);
    const tradeDesc = sanitizeEcpayText(input.itemDescription || "Lalamove Delivery", 100);

    const formData: Record<string, string> = {
      MerchantID: this.config.merchantId,
      MerchantTradeNo: input.merchantTradeNo,
      MerchantTradeDate: formatDateToEcpay(tradeDate),
      PaymentType: "aio",
      TotalAmount: String(Math.round(input.amount)),
      TradeDesc: tradeDesc,
      ItemName: itemName,
      ReturnURL: returnUrl,
      ChoosePayment: "Credit",
      EncryptType: "1",
    };

    if (clientBackUrl) {
      formData.ClientBackURL = clientBackUrl;
    }

    if (orderResultUrl) {
      formData.OrderResultURL = orderResultUrl;
    }

    if (input.simulatePaid) {
      formData.SimulatePaid = "1";
    }

    if (input.customParams) {
      for (const [k, v] of Object.entries(input.customParams)) {
        formData[k] = v;
      }
    }

    // 計算 CheckMacValue
    const checkMacValue = generateCheckMacValue(
      formData,
      this.config.hashKey,
      this.config.hashIV
    );
    formData.CheckMacValue = checkMacValue;

    const actionUrl = `${this.config.host.replace(/\/+$/, "")}/Cashier/AioCheckOut/V5`;

    // 產生自動送出的 HTML Form
    const inputFields = Object.entries(formData)
      .map(
        ([key, val]) =>
          `<input type="hidden" name="${key}" value="${String(val)
            .replace(/"/g, "&quot;")}">`
      )
      .join("\n      ");

    const htmlForm = `
      <form id="ecpay-checkout-form" method="POST" action="${actionUrl}">
      ${inputFields}
      </form>
      <script>document.getElementById("ecpay-checkout-form").submit();</script>
    `.trim();

    return {
      provider: this.providerName,
      paymentMethod: "Credit",
      checkoutActionUrl: actionUrl,
      formData,
      htmlForm,
    };
  }

  async verifyAndParseCallback(
    payload: Record<string, string>
  ): Promise<ParsedCallbackResult> {
    const receivedCmv = payload.CheckMacValue || "";
    const isValid = verifyCheckMacValue(
      payload,
      receivedCmv,
      this.config.hashKey,
      this.config.hashIV
    );

    const rtnCode = parseInt(payload.RtnCode || "0", 10);
    const isSuccess = isValid && rtnCode === 1;

    return {
      isValid,
      isSuccess,
      merchantTradeNo: payload.MerchantTradeNo || "",
      tradeNo: payload.TradeNo || "",
      amount: parseInt(payload.TradeAmt || "0", 10),
      paymentDate: parseEcpayDate(payload.PaymentDate),
      paymentMethod: payload.PaymentType || "Credit",
      rtnCode,
      rtnMsg: payload.RtnMsg || "",
      simulatedPaid: payload.SimulatePaid === "1",
      rawPayload: payload,
    };
  }

  async queryPayment(merchantTradeNo: string): Promise<QueryPaymentResult> {
    const actionUrl = `${this.config.host.replace(/\/+$/, "")}/Cashier/QueryTradeInfo/V5`;
    const params: Record<string, string> = {
      MerchantID: this.config.merchantId,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp: String(Math.floor(Date.now() / 1000)),
    };
    params.CheckMacValue = generateCheckMacValue(
      params,
      this.config.hashKey,
      this.config.hashIV
    );

    // 發出 POST form-urlencoded 請求
    const body = new URLSearchParams(params).toString();
    const response = await fetch(actionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const responseText = await response.text();
    const parsedParams = Object.fromEntries(new URLSearchParams(responseText));

    const isValid = verifyCheckMacValue(
      parsedParams,
      parsedParams.CheckMacValue || "",
      this.config.hashKey,
      this.config.hashIV
    );

    const isPaid = isValid && parsedParams.TradeStatus === "1";

    return {
      merchantTradeNo,
      tradeNo: parsedParams.TradeNo,
      isPaid,
      amount: parseInt(parsedParams.TradeAmt || "0", 10),
      tradeStatus: parsedParams.TradeStatus,
      rawResponse: parsedParams,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const actionUrl = `${this.config.host.replace(/\/+$/, "")}/CreditDetail/DoAction`;
    const params: Record<string, string> = {
      MerchantID: this.config.merchantId,
      MerchantTradeNo: input.merchantTradeNo,
      TradeNo: input.tradeNo,
      Action: "R", // R = 退款 (Refund)
      TotalAmount: String(input.amount),
    };
    params.CheckMacValue = generateCheckMacValue(
      params,
      this.config.hashKey,
      this.config.hashIV
    );

    const body = new URLSearchParams(params).toString();
    const response = await fetch(actionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const responseText = await response.text();
    const parsedParams = Object.fromEntries(new URLSearchParams(responseText));
    const rtnCode = parseInt(parsedParams.RtnCode || "0", 10);

    return {
      isSuccess: rtnCode === 1,
      rtnCode,
      rtnMsg: parsedParams.RtnMsg || "",
      rawResponse: parsedParams,
    };
  }
}
