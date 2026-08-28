import {
  ClientModule,
  Config,
  QuotationPayloadBuilder,
} from "@lalamove/lalamove-js";

export interface Coordinates {
  lat: string | number;
  lng: string | number;
}

export interface StopLocation {
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

interface LalamoveRawResponse {
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
}

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
  console.log(`[Lalamove Service] SUCCESS response for ${params.serviceType}:`, JSON.stringify(rawResponse, null, 2));

  const response = rawResponse as unknown as LalamoveRawResponse;

  // Calculate approximate duration based on distance if not provided
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
  };
}
