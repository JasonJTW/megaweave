// server/src/jest.setup.ts
// Provides the minimum env vars required by fail-fast validation in db.ts.
// Tests that make real DB queries must mock the db module directly.
// These values allow the pool config to be constructed without throwing;
// the pool itself will never connect in the unit test environment.

process.env.DB_CONNECTION_LIMIT = process.env.DB_CONNECTION_LIMIT ?? "20";
process.env.WORKER_DB_CONNECTION_LIMIT =
  process.env.WORKER_DB_CONNECTION_LIMIT ?? "5";
process.env.API_DB_CONNECTION_LIMIT =
  process.env.API_DB_CONNECTION_LIMIT ?? "15";

// ECPay 官方公開的測試商店憑證，只為了讓 payments.ts 的 fail-fast 驗證在單元測試
// 環境下能通過；所有付款測試都注入 mock provider，不會實際送出請求。
process.env.ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID ?? "3002607";
process.env.ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY ?? "pwFHCqoQZGmho4w6";
process.env.ECPAY_HASH_IV = process.env.ECPAY_HASH_IV ?? "EkRm7iFT261dpevs";
process.env.ECPAY_HOST =
  process.env.ECPAY_HOST ?? "https://payment-stage.ecpay.com.tw";
