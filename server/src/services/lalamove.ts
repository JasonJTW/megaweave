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

/**
 * 試算運費報價
 */
export async function requestLalamoveQuotation(
  params: GetQuotationParams,
): Promise<QuotationResult> {
  const client = getClient();

  const formattedStops = params.stops.map((stop) => ({
    coordinates: {
      lat: String(stop.coordinates.lat),
      lng: String(stop.coordinates.lng),
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

  const rawResponse = await client.Quotation.create(LALAMOVE_MARKET, payload);
  console.log(`[Lalamove Service] SUCCESS quotation response for ${params.serviceType}:`, JSON.stringify(rawResponse, null, 2));

  const response = rawResponse as unknown as LalamoveRawQuotationResponse;

  const distanceMeters = Number(response?.distance?.value || 0);
  const distanceKm = distanceMeters / 1000;
  const durationMins = Math.max(10, Math.round(distanceKm * 4 + 8));

  return {
    quotationId: response.quotationId || response.id || `quote_${Date.now()}`,
    serviceType: params.serviceType,
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
        coordinates: driverRes.coordinates ? {
          lat: driverRes.coordinates.lat,
          lng: driverRes.coordinates.lng,
        } : undefined,
        updatedAt: driverRes.updatedAt,
      };
    } catch (driverErr) {
      console.warn(`[Lalamove Service] Could not fetch driver ${driverId}:`, driverErr);
    }
  }

  return {
    orderId: response.id || response.orderId || orderId,
    quotationId: response.quotationId || "",
    status: response.status || "ASSIGNING_DRIVER",
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
