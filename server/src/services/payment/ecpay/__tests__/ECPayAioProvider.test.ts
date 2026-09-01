import { ECPayAioProvider } from "../ECPayAioProvider";
import { CreatePaymentSessionInput } from "../../types";
import { generateCheckMacValue } from "../cmv";

describe("ECPayAioProvider (Seam 2)", () => {
  const config = {
    merchantId: "3002607",
    hashKey: "pwFHCqoQZGmho4w6",
    hashIV: "EkRm7iFT261dpevs",
    host: "https://payment-stage.ecpay.com.tw",
    returnUrl: "https://example.com/api/payments/ecpay/callback",
    clientBackUrl: "https://example.com/payment/result",
  };

  let provider: ECPayAioProvider;

  beforeEach(() => {
    provider = new ECPayAioProvider(config);
  });

  describe("createPaymentSession", () => {
    it("should generate proper AIO form data with CheckMacValue and action URL", async () => {
      const input: CreatePaymentSessionInput = {
        merchantTradeNo: "TW20260301001",
        amount: 350,
        itemDescription: "Lalamove Delivery Service",
        tradeDate: new Date("2026-03-01T12:00:00+08:00"),
        simulatePaid: true,
      };

      const session = await provider.createPaymentSession(input);

      expect(session.provider).toBe("ECPAY_AIO");
      expect(session.checkoutActionUrl).toBe(
        "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
      );
      expect(session.formData.MerchantID).toBe("3002607");
      expect(session.formData.MerchantTradeNo).toBe("TW20260301001");
      expect(session.formData.TotalAmount).toBe("350");
      expect(session.formData.PaymentType).toBe("aio");
      expect(session.formData.ChoosePayment).toBe("Credit");
      expect(session.formData.EncryptType).toBe("1");
      expect(session.formData.SimulatePaid).toBe("1");
      expect(session.formData.ReturnURL).toBe(config.returnUrl);
      expect(session.formData.ClientBackURL).toBe(config.clientBackUrl);
      expect(session.formData.CheckMacValue).toBeDefined();
      expect(session.formData.CheckMacValue.length).toBe(64); // SHA256 length
      expect(session.htmlForm).toContain("<form");
      expect(session.htmlForm).toContain('name="CheckMacValue"');
    });

    it("should sanitize and truncate itemDescription to prevent WAF / length errors", async () => {
      const input: CreatePaymentSessionInput = {
        merchantTradeNo: "TW20260301002",
        amount: 500,
        itemDescription: "Delivery echo cmd python order #1234",
      };

      const session = await provider.createPaymentSession(input);
      expect(session.formData.ItemName).toBe("Delivery order #1234");
    });
  });

  describe("verifyAndParseCallback", () => {
    it("should successfully parse and verify a valid callback payload", async () => {
      const payload: Record<string, string> = {
        MerchantID: "3002607",
        MerchantTradeNo: "TW20260301001",
        RtnCode: "1",
        RtnMsg: "Succeeded",
        TradeNo: "2603011234567890",
        TradeAmt: "350",
        PaymentDate: "2026/03/01 12:05:00",
        PaymentType: "Credit_CreditCard",
        TradeDate: "2026/03/01 12:00:00",
        SimulatePaid: "0",
      };

      // Generate valid CMV for this payload
      payload.CheckMacValue = generateCheckMacValue(
        payload,
        config.hashKey,
        config.hashIV,
      );

      const result = await provider.verifyAndParseCallback(payload);

      expect(result.isValid).toBe(true);
      expect(result.isSuccess).toBe(true);
      expect(result.merchantTradeNo).toBe("TW20260301001");
      expect(result.tradeNo).toBe("2603011234567890");
      expect(result.amount).toBe(350);
      expect(result.rtnCode).toBe(1);
      expect(result.paymentDate).toEqual(new Date("2026-03-01T12:05:00+08:00"));
      expect(result.simulatedPaid).toBe(false);
    });

    it("should mark isValid as false if CheckMacValue signature does not match", async () => {
      const payload: Record<string, string> = {
        MerchantID: "3002607",
        MerchantTradeNo: "TW20260301001",
        RtnCode: "1",
        TradeNo: "2603011234567890",
        TradeAmt: "350",
        CheckMacValue:
          "TAMPERED_CHECK_MAC_VALUE_000000000000000000000000000000000000000",
      };

      const result = await provider.verifyAndParseCallback(payload);

      expect(result.isValid).toBe(false);
      expect(result.isSuccess).toBe(false);
    });
  });
});
