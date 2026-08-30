import {
  ClientModule,
  Config,
  QuotationPayloadBuilder,
  OrderPayloadBuilder,
} from "@lalamove/lalamove-js";
import crypto from "crypto";

export interface Coordinates {
  lat: string | number;
  lng: string | number;
}

export interface StopLocation {
  id?: string;
  stopId?: string;
  coordinates: Coordinates;
  address: string;
}

export interface GetQuotationParams {
  serviceType: string; // e.g. "MOTORCYCLE", "VAN", "SUV", "TRUCK330"
  stops: StopLocation[];
  language?: string;
  scheduleAt?: string;
}

export interface QuotationResult {
  quotationId: string;
  serviceType: string;
  expiresAt: string;
  priceBreakdown: {
    total: string;
    currency: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  distance: {
    value: string;
    unit: string;
  };
  durationMins?: number;
  stops?: Array<{
    id?: string;
    coordinates: Coordinates;
    address: string;
  }>;
}

export interface ContactPerson {
  name: string;
  phone: string;
  remarks?: string;
}

export interface CreateOrderParams {
  quotationId: string;
  sender: ContactPerson & { stopId?: string };
  recipients: Array<ContactPerson & { stopId?: string }>;
  isPODEnabled?: boolean;
  isRecipientSmsEnabled?: boolean;
  partner?: string;
  metadata?: Record<string, unknown>;
}

export interface DriverInfo {
  id: string;
  name: string;
  phone: string;
  plateNumber: string;
  photo?: string;
  coordinates?: Coordinates;
  updatedAt?: string | Date;
}

export interface OrderDetailResult {
  orderId: string;
  quotationId: string;
  serviceType?: string;
  status: string; // "ASSIGNING_DRIVER" | "ON_GOING" | "PICKED_UP" | "COMPLETED" | "CANCELED" | "EXPIRED" | "REJECTED"
  shareLink?: string;
  driverId?: string;
  driver?: DriverInfo | null;
  priceBreakdown: {
    total: string;
    currency: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  distance?: {
    value: string;
    unit: string;
  };
  stops: Array<{
    id?: string;
    coordinates: Coordinates;
    address: string;
    name?: string;
    phone?: string;
    remarks?: string;
  }>;
  metadata?: Record<string, unknown>;
}

const LALAMOVE_API_KEY = process.env.LALAMOVE_API_KEY || "";
const LALAMOVE_API_SECRET = process.env.LALAMOVE_API_SECRET || "";
const LALAMOVE_ENV = (process.env.LALAMOVE_ENV || "sandbox").toLowerCase() as
  | "sandbox"
  | "production";
const LALAMOVE_MARKET = process.env.LALAMOVE_MARKET || "TW";

let clientInstance: InstanceType<typeof ClientModule> | null = null;

function getClient(): InstanceType<typeof ClientModule> {
  const apiKey = process.env.LALAMOVE_API_KEY || LALAMOVE_API_KEY;
  const apiSecret = process.env.LALAMOVE_API_SECRET || LALAMOVE_API_SECRET;
  const env = ((process.env.LALAMOVE_ENV || LALAMOVE_ENV).toLowerCase()) as
    | "sandbox"
    | "production";

  if (!apiKey || !apiSecret) {
    throw new Error("Lalamove API Key and Secret are not configured");
  }

  if (!clientInstance) {
    const config = new Config(apiKey, apiSecret, env);
    clientInstance = new ClientModule(config);
  }
  return clientInstance;
}

export interface LalamoveMarketInfo {
  cities: Array<{
    id: string;
    name: string;
    services: Array<{
      key: string;
      description: string;
      load?: { value: string; unit: string };
      dimensions?: {
        length?: { value: string; unit: string };
        width?: { value: string; unit: string };
        height?: { value: string; unit: string };
      };
      specialRequests?: Array<{ name: string; description: string }>;
    }>;
  }>;
}

let cachedMarketInfo: LalamoveMarketInfo | null = null;
let marketCacheTimestamp = 0;

/**
 * 取得 Lalamove 官方 Market / City Info（Source of Truth）
 */
export async function getLalamoveMarketInfo(
  forceRefresh = false,
): Promise<LalamoveMarketInfo> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedMarketInfo &&
    now - marketCacheTimestamp < 30 * 60 * 1000
  ) {
    return cachedMarketInfo;
  }
  const client = getClient();
  const market = (await client.Market.retrieve(
    LALAMOVE_MARKET,
  )) as unknown as LalamoveMarketInfo;
  cachedMarketInfo = market;
  marketCacheTimestamp = now;
  return market;
}

interface LalamoveRawQuotationResponse {
  quotationId?: string;
  id?: string;
  expiresAt?: string;
  priceBreakdown?: {
    total?: string;
    currency?: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  totalFee?: string;
  distance?: {
    value?: string;
    unit?: string;
  };
  stops?: Array<{
    id?: string;
    coordinates: {
      lat: string;
      lng: string;
    };
    address: string;
  }>;
}

interface LalamoveRawOrderResponse {
  id?: string;
  orderId?: string;
  quotationId?: string;
  serviceType?: string;
  status?: string;
  shareLink?: string;
  driverId?: string;
  priceBreakdown?: {
    total?: string;
    currency?: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  totalFee?: string;
  distance?: {
    value?: string;
    unit?: string;
  };
  stops?: Array<{
    id?: string;
    coordinates: {
      lat: string;
      lng: string;
    };
    address: string;
    name?: string;
    phone?: string;
    remarks?: string;
  }>;
  metadata?: Record<string, unknown>;
}

interface LalamoveRawDriverResponse {
  id?: string;
  contact?: {
    name?: string;
    phone?: string;
  };
  name?: string;
  phone?: string;
  plateNumber?: string;
  photo?: string;
  coordinates?: {
    lat: string;
    lng: string;
  };
  updatedAt?: string | Date;
}

function formatLat(val: string | number | undefined): string {
  const n = typeof val === "number" ? val : parseFloat(String(val || "25.033"));
  if (isNaN(n)) return "25.033000";
  return n.toFixed(6);
}

function formatLng(val: string | number | undefined): string {
  const n = typeof val === "number" ? val : parseFloat(String(val || "121.5654"));
  if (isNaN(n)) return "121.565400";
  return n.toFixed(6);
}

/**
 * 試算運費報價
 */
export async function requestLalamoveQuotation(
  params: GetQuotationParams,
): Promise<QuotationResult> {
  const client = getClient();

  const formattedStops = params.stops.map((stop) => ({
    coordinates: {
      lat: formatLat(stop.coordinates.lat),
      lng: formatLng(stop.coordinates.lng),
    },
    address: stop.address,
  }));

  let payloadBuilder = QuotationPayloadBuilder.quotationPayload()
    .withLanguage(params.language || "zh_TW")
    .withServiceType(params.serviceType)
    .withStops(formattedStops);

  if (params.scheduleAt) {
    payloadBuilder = payloadBuilder.withScheduleAt(
      new Date(params.scheduleAt),
    );
  }

  const payload = payloadBuilder.build();
  console.log(`[Lalamove Service] Requesting ${params.serviceType} quotation with payload:`, JSON.stringify(payload, null, 2));

  let rawResponse: unknown;
  let resolvedServiceType = params.serviceType;
  try {
    rawResponse = await client.Quotation.create(LALAMOVE_MARKET, payload);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // FIXME: [Lalamove TW API Regional Limitation]
    // In Taipei (TW_TPE), Lalamove API only accepts TRUCK330 (and merges 1.75T & 3.49T into 500-1000kg).
    // In Central/South Taiwan (TW_TXG, TW_TNN, TW_KHH), it only accepts TRUCK175.
    // In Taipei, TRUCK175 and TRUCK330 yield identical quotation pricing until Lalamove support clarifies tonnage differentiation parameters.
    if (params.serviceType === "TRUCK175" && errMsg.includes("TRUCK330")) {
      console.log("[Lalamove Service] TRUCK175 not available in this region, falling back to TRUCK330");
      let fallbackBuilder = QuotationPayloadBuilder.quotationPayload()
        .withLanguage(params.language || "zh_TW")
        .withServiceType("TRUCK330")
        .withStops(formattedStops);
      if (params.scheduleAt) {
        fallbackBuilder = fallbackBuilder.withScheduleAt(new Date(params.scheduleAt));
      }
      rawResponse = await client.Quotation.create(LALAMOVE_MARKET, fallbackBuilder.build());
      resolvedServiceType = "TRUCK330";
    } else if (params.serviceType === "TRUCK330" && errMsg.includes("TRUCK175")) {
      // 中南部地區 TRUCK330 自動回退至 TRUCK175
      console.log("[Lalamove Service] TRUCK330 not available in this region, falling back to TRUCK175");
      let fallbackBuilder = QuotationPayloadBuilder.quotationPayload()
        .withLanguage(params.language || "zh_TW")
        .withServiceType("TRUCK175")
        .withStops(formattedStops);
      if (params.scheduleAt) {
        fallbackBuilder = fallbackBuilder.withScheduleAt(new Date(params.scheduleAt));
      }
      rawResponse = await client.Quotation.create(LALAMOVE_MARKET, fallbackBuilder.build());
      resolvedServiceType = "TRUCK175";
    } else {
      throw err;
    }
  }

  console.log(`[Lalamove Service] SUCCESS quotation response for ${resolvedServiceType}:`, JSON.stringify(rawResponse, null, 2));

  const response = rawResponse as unknown as LalamoveRawQuotationResponse;

  const distanceMeters = Number(response?.distance?.value || 0);
  const distanceKm = distanceMeters / 1000;
  const durationMins = Math.max(10, Math.round(distanceKm * 4 + 8));

  return {
    quotationId: response.quotationId || response.id || `quote_${Date.now()}`,
    serviceType: resolvedServiceType,
    expiresAt:
      response.expiresAt ||
      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    priceBreakdown: {
      total: response.priceBreakdown?.total || response.totalFee || "0",
      currency: response.priceBreakdown?.currency || "TWD",
      base: response.priceBreakdown?.base,
      extraMileage: response.priceBreakdown?.extraMileage,
      surcharge: response.priceBreakdown?.surcharge,
    },
    distance: {
      value: response.distance?.value || "0",
      unit: response.distance?.unit || "m",
    },
    durationMins,
    stops: response.stops?.map((s) => ({
      id: s.id,
      coordinates: {
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
      },
      address: s.address,
    })),
  };
}

/**
 * 建立 Lalamove 配送訂單
 */
export async function createLalamoveOrder(
  params: CreateOrderParams,
): Promise<OrderDetailResult> {
  const client = getClient();

  let senderStopId = params.sender.stopId;
  let recipientStopIds = params.recipients.map((r) => r.stopId);

  // If stop IDs are missing or empty, retrieve them directly from quotation
  if (!senderStopId || recipientStopIds.some((id) => !id)) {
    try {
      console.log(
        `[Lalamove Service] Stop IDs missing, retrieving quotation ${params.quotationId} from Lalamove...`,
      );
      const quotation = await client.Quotation.retrieve(
        LALAMOVE_MARKET,
        params.quotationId,
      );
      if (quotation?.stops && quotation.stops.length >= 2) {
        senderStopId = quotation.stops[0].id || "";
        recipientStopIds = quotation.stops.slice(1).map((s) => s.id || "");
        console.log(
          `[Lalamove Service] Successfully matched stop IDs from quotation: sender=${senderStopId}, recipients=${recipientStopIds.join(",")}`,
        );
      }
    } catch (qErr) {
      console.warn(
        "[Lalamove Service] Could not retrieve quotation for stop IDs:",
        qErr,
      );
    }
  }

  const senderPayload = {
    stopId: senderStopId || "",
    name: params.sender.name,
    phone: params.sender.phone,
  };

  const recipientPayloads = params.recipients.map((r, index) => ({
    stopId: recipientStopIds[index] || r.stopId || "",
    name: r.name,
    phone: r.phone,
    remarks: r.remarks || "",
  }));

  let builder = OrderPayloadBuilder.orderPayload()
    .withQuotationID(params.quotationId)
    .withSender(senderPayload)
    .withRecipients(recipientPayloads);

  if (params.isPODEnabled !== undefined) {
    builder = builder.withIsPODEnabled(params.isPODEnabled);
  }
  if (params.isRecipientSmsEnabled !== undefined) {
    builder = builder.withIsRecipientSmsEnabled(params.isRecipientSmsEnabled);
  }
  if (params.partner) {
    builder = builder.withPartner(params.partner);
  }
  if (params.metadata && Object.keys(params.metadata).length > 0) {
    const sanitizedMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.metadata)) {
      if (v !== undefined && v !== null) {
        sanitizedMetadata[k] = String(v);
      }
    }
    builder = builder.withMetadata(sanitizedMetadata);
  }

  const payload = builder.build();
  console.log(
    "[Lalamove Service] Creating Order with payload:",
    JSON.stringify(payload, null, 2),
  );

  let rawOrder: unknown;
  try {
    rawOrder = await client.Order.create(LALAMOVE_MARKET, payload);
    console.log(
      "[Lalamove Service] Order created successfully:",
      JSON.stringify(rawOrder, null, 2),
    );
  } catch (createErr: unknown) {
    const errObj = createErr as {
      httpStatus?: number;
      errors?: unknown;
      message?: string;
    };
    console.error("[Lalamove Service] Detailed Order creation error:", {
      status: errObj.httpStatus,
      errors: errObj.errors,
      message: errObj.message,
      full: createErr,
    });
    throw createErr;
  }

  const response = rawOrder as unknown as LalamoveRawOrderResponse;
  const orderId = response.id || response.orderId || "";

  return {
    orderId,
    quotationId: response.quotationId || params.quotationId,
    serviceType: response.serviceType || "",
    status: response.status || "ASSIGNING_DRIVER",
    shareLink: response.shareLink || "",
    driverId: response.driverId || "",
    driver: null,
    priceBreakdown: {
      total: response.priceBreakdown?.total || response.totalFee || "0",
      currency: response.priceBreakdown?.currency || "TWD",
      base: response.priceBreakdown?.base,
      extraMileage: response.priceBreakdown?.extraMileage,
      surcharge: response.priceBreakdown?.surcharge,
    },
    distance: response.distance ? {
      value: response.distance.value || "0",
      unit: response.distance.unit || "m",
    } : undefined,
    stops: response.stops ? response.stops.map((s) => ({
      id: s.id,
      coordinates: {
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
      },
      address: s.address,
      name: s.name,
      phone: s.phone,
      remarks: s.remarks,
    })) : [],
    metadata: response.metadata,
  };
}

/**
 * 查詢訂單詳細資訊（包含司機詳細資料與座標）
 */
export async function getLalamoveOrderDetail(
  orderId: string,
): Promise<OrderDetailResult> {
  const client = getClient();
  const rawOrder = await client.Order.retrieve(LALAMOVE_MARKET, orderId);
  const response = rawOrder as unknown as LalamoveRawOrderResponse;

  console.log(
    `[Lalamove Service] Retrieved order ${orderId} latest status:`,
    response.status,
    `raw:`,
    JSON.stringify(rawOrder, null, 2),
  );

  let driver: DriverInfo | null = null;
  const driverId = response.driverId;

  if (driverId && driverId.trim() !== "") {
    try {
      const rawDriver = await client.Driver.retrieve(
        LALAMOVE_MARKET,
        driverId,
        orderId,
      );
      const driverRes = rawDriver as unknown as LalamoveRawDriverResponse;
      driver = {
        id: driverRes.id || driverId,
        name: driverRes.contact?.name || driverRes.name || "Lalamove 司機",
        phone: driverRes.contact?.phone || driverRes.phone || "",
        plateNumber: driverRes.plateNumber || "",
        photo: driverRes.photo || "",
        coordinates: driverRes.coordinates
          ? {
              lat: driverRes.coordinates.lat,
              lng: driverRes.coordinates.lng,
            }
          : undefined,
        updatedAt: driverRes.updatedAt,
      };
    } catch (driverErr) {
      console.warn(
        `[Lalamove Service] Could not fetch driver ${driverId}:`,
        driverErr,
      );
    }
  }

  let serviceType =
    response.serviceType ||
    (response.metadata?.serviceType as string) ||
    "";

  if (!serviceType && response.quotationId) {
    try {
      const rawQuotation = await client.Quotation.retrieve(
        LALAMOVE_MARKET,
        response.quotationId,
      );
      const qRes = rawQuotation as unknown as { serviceType?: string };
      serviceType = qRes.serviceType || "";
    } catch (qErr) {
      console.warn(`[Lalamove Service] Could not fetch quotation for serviceType:`, qErr);
    }
  }

  // 若有 Sandbox 自訂司機座標，優先套用
  const customDriverCoords = sandboxDriverCoordinates.get(orderId);
  if (customDriverCoords) {
    if (driver) {
      driver.coordinates = customDriverCoords;
    } else {
      driver = {
        id: driverId || "sandbox_driver",
        name: "Lalamove 司機 (測試)",
        phone: "+886912345678",
        plateNumber: "TEST-8888",
        coordinates: customDriverCoords,
      };
    }
  }

  // 若有 Sandbox 模擬狀態，優先套用
  const customStatus = sandboxOrderStatus.get(orderId);
  const finalStatus = (customStatus || response.status || "ASSIGNING_DRIVER").toUpperCase();

  return {
    orderId: response.id || response.orderId || orderId,
    quotationId: response.quotationId || "",
    serviceType,
    status: finalStatus,
    shareLink: response.shareLink || "",
    driverId: response.driverId || "",
    driver,
    priceBreakdown: {
      total: response.priceBreakdown?.total || response.totalFee || "0",
      currency: response.priceBreakdown?.currency || "TWD",
      base: response.priceBreakdown?.base,
      extraMileage: response.priceBreakdown?.extraMileage,
      surcharge: response.priceBreakdown?.surcharge,
    },
    distance: response.distance ? {
      value: response.distance.value || "0",
      unit: response.distance.unit || "m",
    } : undefined,
    stops: response.stops ? response.stops.map((s) => ({
      id: s.id,
      coordinates: {
        lat: s.coordinates.lat,
        lng: s.coordinates.lng,
      },
      address: s.address,
      name: s.name,
      phone: s.phone,
      remarks: s.remarks,
    })) : [],
    metadata: response.metadata,
  };
}

/**
 * 取消 Lalamove 訂單
 */
export async function cancelLalamoveOrder(
  orderId: string,
): Promise<{ success: boolean; orderId: string }> {
  const client = getClient();
  const res = await client.Order.cancel(LALAMOVE_MARKET, orderId);
  return {
    success: !!res,
    orderId,
  };
}

/**
 * 取得司機即時位置
 */
export async function getLalamoveDriverDetail(
  orderId: string,
  driverId: string,
): Promise<DriverInfo | null> {
  const client = getClient();
  try {
    const rawDriver = await client.Driver.retrieve(
      LALAMOVE_MARKET,
      driverId,
      orderId,
    );
    const driverRes = rawDriver as unknown as LalamoveRawDriverResponse;
    return {
      id: driverRes.id || driverId,
      name: driverRes.contact?.name || driverRes.name || "Lalamove 司機",
      phone: driverRes.contact?.phone || driverRes.phone || "",
      plateNumber: driverRes.plateNumber || "",
      photo: driverRes.photo || "",
      coordinates: driverRes.coordinates ? {
        lat: driverRes.coordinates.lat,
        lng: driverRes.coordinates.lng,
      } : undefined,
      updatedAt: driverRes.updatedAt,
    };
  } catch (error) {
    console.error(`[Lalamove Service] Error getting driver detail:`, error);
    return null;
  }
}

/**
 * 驗證 Lalamove Webhook 簽名
 */
export function verifyLalamoveWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
): boolean {
  const secret = process.env.LALAMOVE_API_SECRET || LALAMOVE_API_SECRET;
  if (!secret) return true; // If no secret configured, pass in dev

  if (!signatureHeader) return false;

  // Lalamove header may be in format: "t=12345678,v1=abcdef..." or raw hex
  let timestamp = timestampHeader || "";
  let signature = signatureHeader;

  if (signatureHeader.includes("t=") && signatureHeader.includes("v1=")) {
    const parts = signatureHeader.split(",");
    const tPart = parts.find((p) => p.startsWith("t="));
    const vPart = parts.find((p) => p.startsWith("v1="));
    if (tPart) timestamp = tPart.replace("t=", "");
    if (vPart) signature = vPart.replace("v1=", "");
  }

  try {
    const dataToSign = `${timestamp}\r\nPOST\r\n/api/lalamove/webhook\r\n\r\n${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(dataToSign)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch (e) {
    console.error("[Lalamove Service] Webhook signature verification error:", e);
    return false;
  }
}

// ─────────────────────────────────────────────
// Sandbox 模擬控制 API（僅供開發測試用）
// ─────────────────────────────────────────────

const sandboxDriverCoordinates = new Map<string, { lat: string; lng: string }>();
const sandboxOrderStatus = new Map<string, string>();

function sandboxSign(
  method: string,
  path: string,
  body: string,
  timestamp: string,
): string {
  const secret = process.env.LALAMOVE_API_SECRET || LALAMOVE_API_SECRET;
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  return crypto.createHmac("sha256", secret).update(rawSignature).digest("hex");
}

async function sandboxFetch(
  method: string,
  path: string,
  bodyObj?: Record<string, unknown>,
): Promise<unknown> {
  const https = await import("https");
  const apiKey = process.env.LALAMOVE_API_KEY || LALAMOVE_API_KEY;
  const market = LALAMOVE_MARKET;
  const timestamp = Date.now().toString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const signature = sandboxSign(method, path, body, timestamp);
  const token = `${apiKey}:${timestamp}:${signature}`;

  return new Promise((resolve, reject) => {
    const options: import("https").RequestOptions = {
      hostname: "rest.sandbox.lalamove.com",
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `hmac ${token}`,
        Market: market,
        ...(body ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
      },
    };

    const req = https.default.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        console.log(`[Lalamove Sandbox] ${method} ${path} => HTTP ${res.statusCode}`);
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * [Sandbox] 更新司機 GPS 位置
 */
export async function sandboxUpdateDriverLocation(
  orderId: string,
  lat: string,
  lng: string,
): Promise<{ success: boolean; lat: string; lng: string }> {
  const formattedLat = formatLat(lat);
  const formattedLng = formatLng(lng);

  // 儲存於伺服器記憶體，確保後續任何 API 查詢、SWR 輪詢皆取得最新座標
  sandboxDriverCoordinates.set(orderId, {
    lat: formattedLat,
    lng: formattedLng,
  });

  // 嘗試同步發送至 Lalamove 官方 Sandbox 端點
  let driverId = "";
  try {
    const client = getClient();
    const rawOrder = await client.Order.retrieve(LALAMOVE_MARKET, orderId);
    const orderRes = rawOrder as unknown as LalamoveRawOrderResponse;
    driverId = orderRes.driverId || "";
  } catch (e) {
    console.warn("[Sandbox] Could not retrieve driverId for order:", e);
  }

  if (driverId) {
    try {
      await sandboxFetch(
        "PUT",
        `/v3/orders/${orderId}/drivers/${driverId}/location`,
        {
          data: {
            location: {
              lat: formattedLat,
              lng: formattedLng,
            },
          },
        },
      );
    } catch (e) {
      console.warn("[Sandbox] Endpoint /drivers/location error:", e);
    }
  }

  try {
    await sandboxFetch("PUT", `/v3/orders/${orderId}/driver-location`, {
      data: {
        location: {
          lat: formattedLat,
          lng: formattedLng,
        },
        coordinates: {
          lat: formattedLat,
          lng: formattedLng,
        },
        lat: formattedLat,
        lng: formattedLng,
      },
    });
  } catch (e) {
    console.warn("[Sandbox] Endpoint /driver-location error:", e);
  }

  return { success: true, lat: formattedLat, lng: formattedLng };
}

/**
 * [Sandbox] 模擬司機已取件
 */
export async function sandboxPickup(orderId: string): Promise<unknown> {
  sandboxOrderStatus.set(orderId, "PICKED_UP");
  try {
    await sandboxFetch("PUT", `/v3/orders/${orderId}/pickup`, { data: {} });
  } catch (e) {
    console.warn("[Sandbox] pickup error:", e);
  }
  return { success: true, status: "PICKED_UP" };
}

/**
 * [Sandbox] 模擬送達完成
 */
export async function sandboxDeliver(orderId: string): Promise<unknown> {
  sandboxOrderStatus.set(orderId, "COMPLETED");
  try {
    await sandboxFetch("PUT", `/v3/orders/${orderId}/deliver`, { data: {} });
  } catch (e) {
    console.warn("[Sandbox] deliver error:", e);
  }
  return { success: true, status: "COMPLETED" };
}
