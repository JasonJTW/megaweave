/**
 * POST /api/lalamove/quotation 每次都打付費的 Lalamove API，未登入不能呼叫（成本／濫用向量）。
 * 走 createApp() 的完整 middleware 鏈，401 來自真正的 requireAuth。
 */
import type { Express } from "express";
import { request } from "./testUtils/testApi";
import { authenticateRequest } from "./session";
import { requestLalamoveQuotation } from "./services/lalamove";
import { ALL_SUPPORTED_SERVICE_TYPES } from "./lalamove";

jest.mock("./session", () => ({
  ...jest.requireActual("./session"),
  authenticateRequest: jest.fn(),
}));

jest.mock("./services/lalamove", () => ({
  ...jest.requireActual("./services/lalamove"),
  requestLalamoveQuotation: jest.fn(),
}));

const STOPS = [
  { coordinates: { lat: "25.03", lng: "121.56" }, address: "台北市信義區市府路1號" },
  { coordinates: { lat: "25.05", lng: "121.58" }, address: "台北市松山區八德路四段1號" },
];

describe("POST /api/lalamove/quotation", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  beforeEach(() => {
    jest.mocked(authenticateRequest).mockReset().mockResolvedValue(null);
    jest.mocked(requestLalamoveQuotation).mockReset();
  });

  it("rejects a request without a session with 401 UNAUTHENTICATED and never calls Lalamove", async () => {
    const res = await request(app)
      .post("/api/lalamove/quotation")
      .send({ serviceTypes: ["MOTORCYCLE"], stops: STOPS });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
    expect(requestLalamoveQuotation).not.toHaveBeenCalled();
  });

  const signIn = () =>
    jest.mocked(authenticateRequest).mockResolvedValue({
      userId: 7,
      role: "user",
      username: "alice",
      email: "alice@example.com",
      public_id: "123e4567-e89b-42d3-a456-426614174000",
      joined_at: new Date("2025-01-01"),
    });

  it("quotes for a signed-in user", async () => {
    signIn();
    jest.mocked(requestLalamoveQuotation).mockResolvedValue({
      quotationId: "Q1",
    } as Awaited<ReturnType<typeof requestLalamoveQuotation>>);

    const res = await request(app)
      .post("/api/lalamove/quotation")
      .set("Cookie", "session=abc")
      .send({ serviceTypes: ["MOTORCYCLE"], stops: STOPS });

    expect(res.status).toBe(200);
    expect(res.body.primary).toMatchObject({ quotationId: "Q1", serviceName: "MOTORCYCLE" });
    expect(requestLalamoveQuotation).toHaveBeenCalledTimes(1);
  });

  it("quotes every supported service type in one request", async () => {
    signIn();
    jest.mocked(requestLalamoveQuotation).mockResolvedValue({
      quotationId: "Q1",
    } as Awaited<ReturnType<typeof requestLalamoveQuotation>>);

    const res = await request(app)
      .post("/api/lalamove/quotation")
      .set("Cookie", "session=abc")
      .send({ serviceTypes: [...ALL_SUPPORTED_SERVICE_TYPES], stops: STOPS });

    expect(res.status).toBe(200);
    expect(requestLalamoveQuotation).toHaveBeenCalledTimes(ALL_SUPPORTED_SERVICE_TYPES.length);
  });

  //* 每個 service type 都是一次付費的 Lalamove 呼叫：清單只能是支援的車型，不重複、不超過車型數
  it.each([
    ["an empty list", []],
    ["an unsupported type", ["MOTORCYCLE", "HELICOPTER"]],
    ["a non-string entry", [42]],
    ["a duplicated type", ["MOTORCYCLE", "MOTORCYCLE"]],
    [
      "more entries than supported types",
      [...ALL_SUPPORTED_SERVICE_TYPES, "MOTORCYCLE"],
    ],
    ["a string instead of a list", "MOTORCYCLE"],
  ])(
    "rejects serviceTypes with %s as 400 INVALID_REQUEST and never calls Lalamove",
    async (_label, serviceTypes) => {
      signIn();

      const res = await request(app)
        .post("/api/lalamove/quotation")
        .set("Cookie", "session=abc")
        .send({ serviceTypes, stops: STOPS });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
      expect(requestLalamoveQuotation).not.toHaveBeenCalled();
    },
  );

  it("rejects an unsupported single serviceType as 400 INVALID_REQUEST", async () => {
    signIn();

    const res = await request(app)
      .post("/api/lalamove/quotation")
      .set("Cookie", "session=abc")
      .send({ serviceType: "HELICOPTER", stops: STOPS });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(requestLalamoveQuotation).not.toHaveBeenCalled();
  });
});
