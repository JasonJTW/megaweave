import express, { Request, Response } from "express";
import {
  requestLalamoveQuotation,
  GetQuotationParams,
} from "./services/lalamove";

const router = express.Router();

const SUPPORTED_SERVICE_TYPES = [
  { id: "MOTORCYCLE", name: "機車", description: "小型包裹、文件 (40×40×40 cm / 20kg 內)" },
  { id: "VAN", name: "廂型車", description: "中型包裹、多箱物資 (150×100×100 cm / 300kg 內)" },
  { id: "SUV", name: "休旅車", description: "加大空間、中大型物資 (150×120×100 cm / 400kg 內)" },
  { id: "TRUCK330", name: "3.49噸 貨車", description: "家庭搬家、超大件棧板 (300×150×150 cm / 1,000kg 內)" },
];

/**
 * GET /api/lalamove/service-types
 * Returns available vehicle types in Taiwan
 */
router.get("/service-types", (_req: Request, res: Response) => {
  res.json({
    market: "TW",
    services: SUPPORTED_SERVICE_TYPES,
  });
});

/**
 * POST /api/lalamove/quotation
 * Request delivery quotation for one or multiple service types
 */
router.post("/quotation", async (req: Request, res: Response): Promise<void> => {
  try {
    const { serviceType, serviceTypes, stops, language, scheduleAt } = req.body;

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      res.status(400).json({
        error: "Stops are required and must have at least 2 locations (pickup and drop-off)",
      });
      return;
    }

    const [origin, destination] = stops;
    if (!origin?.address || !destination?.address) {
      res.status(400).json({
        error: "Both pickup and drop-off must provide an address",
      });
      return;
    }

    // Determine target service types
    const typesToFetch: string[] = serviceTypes && Array.isArray(serviceTypes) && serviceTypes.length > 0
      ? serviceTypes
      : [serviceType || "MOTORCYCLE"];

    const quotations = await Promise.all(
      typesToFetch.map(async (st: string) => {
        const params: GetQuotationParams = {
          serviceType: st,
          stops,
          language: language || "zh_TW",
          scheduleAt,
        };
        const result = await requestLalamoveQuotation(params);
        const meta = SUPPORTED_SERVICE_TYPES.find((s) => s.id === st);
        return {
          ...result,
          serviceName: meta?.name || st,
          serviceDescription: meta?.description || "",
        };
      })
    );

    res.json({
      success: true,
      quotations,
      primary: quotations[0],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Lalamove quotation route error:", error);
    res.status(500).json({
      error: "Failed to get Lalamove quotation",
      message,
    });
  }
});

export default router;
