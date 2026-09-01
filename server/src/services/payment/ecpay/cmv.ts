import crypto from "crypto";

/**
 * ECPay 專用 URL Encode 邏輯 (CMV 協議模式: AIO 金流 / 國內物流)
 * 規則:
 * 1. 標準 urlencode (空格轉為 +)
 * 2. 轉為全小寫 toLowerCase()
 * 3. 還原 .NET 特殊字元: - _ . ! * ( )
 * 4. ~ 編碼為 %7e (小寫)
 */
export function ecpayUrlEncode(str: string): string {
  let encoded = encodeURIComponent(str)
    // 預設 encodeURIComponent 將空格轉為 %20，需轉為 +
    .replace(/%20/g, "+")
    // encodeURIComponent 不編碼 ~ 與 '，但 PHP urlencode 會編碼為 %7e 與 %27
    .replace(/~/g, "%7e")
    .replace(/'/g, "%27");

  // 轉為小寫
  encoded = encoded.toLowerCase();

  // 還原 .NET 特殊字元 (ECPay SDK 標準替換表)
  const dotNetReplacements: Array<[RegExp, string]> = [
    [/%2d/g, "-"],
    [/%5f/g, "_"],
    [/%2e/g, "."],
    [/%21/g, "!"],
    [/%2a/g, "*"],
    [/%28/g, "("],
    [/%29/g, ")"],
    [/%20/g, "+"], // 確保空格為 +
  ];

  for (const [pattern, replacement] of dotNetReplacements) {
    encoded = encoded.replace(pattern, replacement);
  }

  // 確保 ~ 被正確編碼為 %7e
  encoded = encoded.replace(/~/g, "%7e");

  return encoded;
}

/**
 * 計算 ECPay CheckMacValue (SHA256)
 * @param params 欲簽名之參數鍵值對
 * @param hashKey 綠界 HashKey
 * @param hashIV 綠界 HashIV
 */
export function generateCheckMacValue(
  params: Record<string, string | number | boolean | undefined | null>,
  hashKey: string,
  hashIV: string
): string {
  // 1. 排除 CheckMacValue 欄位並過濾 undefined / null
  const keys = Object.keys(params).filter(
    (key) => key !== "CheckMacValue" && params[key] !== undefined && params[key] !== null
  );

  // 2. 依照參數名稱字母順序排序 (不區分大小寫)
  keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // 3. 組合參數字串: HashKey={HashKey}&param1=val1&param2=val2...&HashIV={HashIV}
  const paramPairs = keys.map((key) => `${key}=${params[key]}`);
  const rawString = `HashKey=${hashKey}&${paramPairs.join("&")}&HashIV=${hashIV}`;

  // 4. 進行 ECPay 專屬 URL Encode
  const encodedString = ecpayUrlEncode(rawString);

  // 5. 進行 SHA256 雜湊並轉為大寫
  const hash = crypto.createHash("sha256").update(encodedString, "utf8").digest("hex");
  return hash.toUpperCase();
}

/**
 * Timing-safe CheckMacValue 驗證
 */
export function verifyCheckMacValue(
  params: Record<string, string | number | boolean | undefined | null>,
  receivedMacValue: string,
  hashKey: string,
  hashIV: string
): boolean {
  if (!receivedMacValue) {
    return false;
  }

  const calculatedMacValue = generateCheckMacValue(params, hashKey, hashIV);

  try {
    const receivedBuffer = Buffer.from(receivedMacValue.toUpperCase(), "utf8");
    const calculatedBuffer = Buffer.from(calculatedMacValue, "utf8");

    if (receivedBuffer.length !== calculatedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, calculatedBuffer);
  } catch {
    return false;
  }
}
