import {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
} from "../cmv";

describe("ECPay CheckMacValue & URL Encode (Seam 1)", () => {
  const hashKey = "pwFHCqoQZGmho4w6";
  const hashIV = "EkRm7iFT261dpevs";

  describe("ecpayUrlEncode", () => {
    it("should encode spaces to + rather than %20", () => {
      const result = ecpayUrlEncode("My Test Product");
      expect(result).toBe("my+test+product");
    });

    it("should correctly preserve lowercase for encoded characters and convert ~ to %7e", () => {
      const result = ecpayUrlEncode("Test~Product");
      expect(result).toBe("test%7eproduct");
    });

    it("should handle .NET specific character substitutions (- _ . ! * ( ))", () => {
      const result = ecpayUrlEncode("a-b_c.d!e*f(g)h");
      expect(result).toBe("a-b_c.d!e*f(g)h");
    });
  });

  describe("generateCheckMacValue", () => {
    it("should pass Vector 1: Standard AIO Payment SHA256 baseline test", () => {
      const params = {
        MerchantID: "3002607",
        MerchantTradeNo: "Test1234567890",
        MerchantTradeDate: "2025/01/01 12:00:00",
        PaymentType: "aio",
        TotalAmount: "100",
        TradeDesc: "測試",
        ItemName: "測試商品",
        ReturnURL: "https://example.com/notify",
        ChoosePayment: "ALL",
        EncryptType: "1",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2"
      );
    });

    it("should pass Vector 3: Special character quote ' handling", () => {
      const params = {
        MerchantID: "3002607",
        ItemName: "Tom's Shop",
        TotalAmount: "100",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D"
      );
    });

    it("should pass Vector 4: Special character ~ handling", () => {
      const params = {
        MerchantID: "3002607",
        ItemName: "Test~Product",
        TotalAmount: "200",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9"
      );
    });

    it("should pass Vector 5: Space handling (+ vs %20)", () => {
      const params = {
        MerchantID: "3002607",
        ItemName: "My Test Product",
        TotalAmount: "300",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316"
      );
    });

    it("should pass Vector 6: Payment Callback verification parameters", () => {
      const params = {
        MerchantID: "3002607",
        MerchantTradeNo: "Test1234567890",
        RtnCode: "1",
        RtnMsg: "Succeeded",
        TradeNo: "2301011234567890",
        TradeAmt: "100",
        PaymentDate: "2025/01/01 12:05:00",
        PaymentType: "Credit_CreditCard",
        TradeDate: "2025/01/01 12:00:00",
        SimulatePaid: "0",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8"
      );
    });

    it("should exclude existing CheckMacValue field if present in input params", () => {
      const params = {
        MerchantID: "3002607",
        ItemName: "My Test Product",
        TotalAmount: "300",
        CheckMacValue: "SHOULD_BE_EXCLUDED",
      };

      const cmv = generateCheckMacValue(params, hashKey, hashIV);
      expect(cmv).toBe(
        "7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316"
      );
    });
  });

  describe("verifyCheckMacValue", () => {
    it("should return true for valid CheckMacValue using timing-safe comparison", () => {
      const params = {
        MerchantID: "3002607",
        MerchantTradeNo: "Test1234567890",
        RtnCode: "1",
        RtnMsg: "Succeeded",
        TradeNo: "2301011234567890",
        TradeAmt: "100",
        PaymentDate: "2025/01/01 12:05:00",
        PaymentType: "Credit_CreditCard",
        TradeDate: "2025/01/01 12:00:00",
        SimulatePaid: "0",
        CheckMacValue:
          "2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8",
      };

      const isValid = verifyCheckMacValue(
        params,
        params.CheckMacValue,
        hashKey,
        hashIV
      );
      expect(isValid).toBe(true);
    });

    it("should return false for tampered CheckMacValue", () => {
      const params = {
        MerchantID: "3002607",
        MerchantTradeNo: "Test1234567890",
        TotalAmount: "100",
      };

      const isValid = verifyCheckMacValue(
        params,
        "INVALID_MAC_VALUE_0000000000000000000000000000000000000000000000000",
        hashKey,
        hashIV
      );
      expect(isValid).toBe(false);
    });
  });
});
