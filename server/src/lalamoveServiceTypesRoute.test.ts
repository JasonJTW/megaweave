/**
 * GET /api/lalamove/service-types 不需登入：Lalamove market info 一律走 30 分鐘快取，
 * 呼叫者不能用 ?refresh=true 繞過快取，讓匿名請求打到 Lalamove。
 * 走 createApp() 的完整 middleware 鏈。
 */
import type { Express } from "express";
import { request } from "./testUtils/testApi";

const retrieveMarket = jest.fn();

jest.mock("@lalamove/lalamove-js", () => ({
  ...jest.requireActual("@lalamove/lalamove-js"),
  ClientModule: jest.fn().mockImplementation(() => ({
    Market: { retrieve: retrieveMarket },
  })),
}));

describe("GET /api/lalamove/service-types", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    process.env.LALAMOVE_API_KEY = "test-key";
    process.env.LALAMOVE_API_SECRET = "test-secret";
    retrieveMarket.mockResolvedValue({ cities: [{ id: "TW_TPE", name: "台北" }] });
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  it("serves the cached market info even when the caller asks for refresh=true", async () => {
    const first = await request(app).get("/api/lalamove/service-types");
    const second = await request(app).get("/api/lalamove/service-types?refresh=true");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.cities).toEqual([{ id: "TW_TPE", name: "台北" }]);
    expect(retrieveMarket).toHaveBeenCalledTimes(1);
  });
});
