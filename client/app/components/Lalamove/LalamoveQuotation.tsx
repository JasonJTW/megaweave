"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Post } from "@/app/types/schema";
import {
  Truck,
  MapPin,
  Navigation,
  Clock,
  RotateCw,
  ChevronDown,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Car,
  Bike,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import OrderPlacementModal from "./OrderPlacementModal";
import { useUser } from "@/app/contexts/UserContext";
import { ArrowRight } from "lucide-react";

/**
 * Strip floor/unit info and fix the duplicate-號 bug from Google Geocoding API
 * before sending to Lalamove. Lalamove requires a clean street-level address.
 *
 * Examples cleaned:
 *   「大智街23巷2弄9號三樓號」 → 「大智街23巷2弄9號」
 *   「信義路五段7號5F」        → 「信義路五段7號」
 *   「忠孝東路四段1號B1」      → 「忠孝東路四段1號」
 */
function sanitizeTwAddress(address: string): string {
  return (
    address
      // Remove floor info: 數字樓, 數字F, BF, B1, B2, 地下室, etc.
      .replace(
        /[\s,，]*[Bb]?\d*[Bb]?[Ff1lL]?[\s]*(?:樓|F|f|FL|fl)(?:之\d+)?/g,
        "",
      )
      // Remove duplicate 號 that Geocoding API sometimes appends after floor removal
      .replace(/號號/g, "號")
      // Remove trailing 號 if it appears after a non-numeric/non-巷弄 character context
      .replace(/(號)\s*號/g, "$1")
      // Clean up any trailing commas, spaces, or orphan punctuation
      .replace(/[,，\s]+$/g, "")
      .trim()
  );
}

export type LalamoveLocale = "en" | "zh";

interface LalamoveQuotationProps {
  post: Post;
  locale?: LalamoveLocale;
}

interface ServiceOption {
  id: string;
  name: { en: string; zh: string };
  subName: { en: string; zh: string };
  icon: "bike" | "van" | "truck";
  weightLimit: { en: string; zh: string };
  sizeLimit: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    id: "MOTORCYCLE",
    name: { en: "Motorcycle", zh: "機車" },
    subName: { en: "Small Parcel", zh: "小型包裹" },
    icon: "bike",
    weightLimit: { en: "Max 20kg", zh: "20kg 內" },
    sizeLimit: "40×40×40 cm",
  },
  {
    id: "VAN",
    name: { en: "Van", zh: "廂型車" },
    subName: { en: "Boxes / Medium", zh: "中型/多箱" },
    icon: "van",
    weightLimit: { en: "Max 300kg", zh: "300kg 內" },
    sizeLimit: "150×100×100 cm",
  },
  {
    id: "SUV",
    name: { en: "SUV / Large Van", zh: "休旅車" },
    subName: { en: "Large Parcel", zh: "加大空間" },
    icon: "van",
    weightLimit: { en: "Max 400kg", zh: "400kg 內" },
    sizeLimit: "150×120×100 cm",
  },
  {
    id: "TRUCK330",
    name: { en: "3.49T Truck", zh: "3.49噸貨車" },
    subName: { en: "Full Move", zh: "全屋搬運" },
    icon: "truck",
    weightLimit: { en: "Max 1,000kg", zh: "1,000kg 內" },
    sizeLimit: "300×150×150 cm",
  },
];

interface TranslationSchema {
  headerTitle: string;
  headerBadge: string;
  headerSubtitle: string;
  expand: string;
  collapse: string;
  approxDistance: string;
  pickupOrigin: string;
  fallbackOrigin: string;
  dropoffDestination: string;
  useCurrentLocation: string;
  locating: string;
  placeholderDestination: string;
  selectVehicle: string;
  calcButton: string;
  calculating: string;
  inputAddressError: string;
  quoteFailed: string;
  estimatedFare: string;
  approxDeliveryTime: (mins: number) => string;
  distanceLabel: (km: string) => string;
  priceBreakdown: string;
  baseFare: string;
  extraMileageFare: string;
  surchargeFare: string;
  quoteValidCountdown: string;
  quoteExpired: string;
  recalculate: string;
  change: string;
  gpsFallback: (lat: number, lng: number) => string;
  capacityLimit: (name: string, size: string, weight: string) => string;
}

const TRANSLATIONS: Record<LalamoveLocale, TranslationSchema> = {
  en: {
    headerTitle: "Lalamove Instant Delivery Quote",
    headerBadge: "On-Demand",
    headerSubtitle:
      "Enter destination address to estimate motorcycle or truck delivery fare",
    expand: "Get Quote",
    collapse: "Collapse",
    approxDistance: "approx.",
    pickupOrigin: "Pickup Location (Item Address)",
    fallbackOrigin: "Item Location",
    dropoffDestination: "Delivery Destination",
    useCurrentLocation: "Use Current Location",
    locating: "Locating...",
    placeholderDestination:
      "Enter delivery address (e.g. No. 7, Sec. 5, Xinyi Rd...)",
    selectVehicle: "Select Vehicle Type",
    calcButton: "Get Instant Quote",
    calculating: "Calculating fare...",
    inputAddressError: "Please enter a destination address",
    quoteFailed: "Failed to get quote, please check address and retry",
    estimatedFare: "Estimated Fare",
    approxDeliveryTime: (mins: number) => `approx. ${mins} mins`,
    distanceLabel: (km: string) => `Distance ${km} km`,
    priceBreakdown: "Fare Breakdown",
    baseFare: "Base Fare",
    extraMileageFare: "Extra Mileage Fare",
    surchargeFare: "Surcharge / Peak Fee",
    quoteValidCountdown: "Quote valid for: ",
    quoteExpired: "Quote Expired",
    recalculate: "Recalculate",
    change: "Change",
    gpsFallback: (lat: number, lng: number) =>
      `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    capacityLimit: (name: string, size: string, weight: string) =>
      `📦 ${name} Max Capacity: ${size} (${weight})`,
  },
  zh: {
    headerTitle: "Lalamove 即時運費試算",
    headerBadge: "即時媒合",
    headerSubtitle: "輸入收件地址，快速試算機車或貨車直送費用",
    expand: "展開試算",
    collapse: "收合",
    approxDistance: "約",
    pickupOrigin: "取件起點 (此商品所在地)",
    fallbackOrigin: "商品所在地點",
    dropoffDestination: "送達地點 (目的地)",
    useCurrentLocation: "使用目前位置",
    locating: "定位中...",
    placeholderDestination: "請輸入地址（如：台北市信義區信義路五段...）",
    selectVehicle: "選擇配送車種",
    calcButton: "開始即時試算",
    calculating: "運費試算中...",
    inputAddressError: "請輸入送達地址",
    quoteFailed: "報價查詢失敗，請確認地址後重試",
    estimatedFare: "預估配送運費",
    approxDeliveryTime: (mins: number) => `約 ${mins} 分鐘送達`,
    distanceLabel: (km: string) => `距離 ${km} km`,
    priceBreakdown: "費用明細",
    baseFare: "基本起程費",
    extraMileageFare: "超里程運費",
    surchargeFare: "時段加成費",
    quoteValidCountdown: "報價保留倒數：",
    quoteExpired: "報價已過期",
    recalculate: "重新試算",
    change: "變更",
    gpsFallback: (lat: number, lng: number) =>
      `GPS 定位 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    capacityLimit: (name: string, size: string, weight: string) =>
      `📦 ${name} 載運上限：${size}（${weight}）`,
  },
};

interface QuotationItem {
  quotationId: string;
  serviceType: string;
  serviceName: string;
  serviceDescription: string;
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

export const LalamoveQuotation: React.FC<LalamoveQuotationProps> = ({
  post,
  locale = "en",
}) => {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";
  const t = TRANSLATIONS[locale] || TRANSLATIONS.en;

  // Destination input
  const destinationInputRef = useRef<HTMLInputElement | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationCoords, setDestinationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Selected Service
  const [selectedService, setSelectedService] = useState<string>("MOTORCYCLE");

  // Quotation states
  const [loading, setLoading] = useState(false);
  const [quotations, setQuotations] = useState<Record<string, QuotationItem>>(
    {},
  );
  const [activeQuotation, setActiveQuotation] = useState<QuotationItem | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { user } = useUser();
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Origin info from post
  const originAddress =
    post.full_address ||
    post.location_name ||
    post.city ||
    (post.province ? `${post.province} ${post.city || ""}` : t.fallbackOrigin);

  const originLat = post.lat || 25.033;
  const originLng = post.lng || 121.5654;

  // Initialize Google Places Autocomplete for destination
  useEffect(() => {
    if (!destinationInputRef.current) return;
    if (typeof window === "undefined" || !window.google?.maps?.places) return;

    try {
      const autocomplete = new window.google.maps.places.Autocomplete(
        destinationInputRef.current,
        {
          componentRestrictions: { country: "tw" },
          fields: ["formatted_address", "geometry", "name"],
        },
      );

      const listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          setDestinationAddress(place.formatted_address);
          setErrorMsg(null);
        } else if (place.name) {
          setDestinationAddress(place.name);
          setErrorMsg(null);
        }

        if (place.geometry?.location) {
          setDestinationCoords({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        }
      });

      return () => {
        if (listener && window.google?.maps?.event) {
          window.google.maps.event.removeListener(listener);
        }
      };
    } catch (e) {
      console.warn("Failed to initialize Google Places autocomplete:", e);
    }
  }, [isExpanded]);

  // Request quotation function
  const handleFetchQuotation = useCallback(
    async (
      serviceTypesToFetch: string[] = ["MOTORCYCLE", "VAN", "SUV", "TRUCK330"],
    ) => {
      if (!destinationAddress.trim()) {
        setErrorMsg(t.inputAddressError);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      try {
        const stops = [
          {
            coordinates: {
              lat: originLat,
              lng: originLng,
            },
            address: sanitizeTwAddress(originAddress),
          },
          {
            coordinates: {
              lat: destinationCoords?.lat || originLat + 0.02,
              lng: destinationCoords?.lng || originLng + 0.02,
            },
            address: sanitizeTwAddress(destinationAddress),
          },
        ];

        const response = await fetch(`${hostName}/api/lalamove/quotation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serviceTypes: serviceTypesToFetch,
            stops,
            language: locale === "en" ? "en_TW" : "zh_TW",
          }),
        });

        const data = await response.json();
        console.log("[Lalamove Client] Received quotation data:", data);

        if (!response.ok || !data.success) {
          throw new Error(data.error || t.quoteFailed);
        }

        const quotesMap: Record<string, QuotationItem> = {};
        data.quotations.forEach((q: QuotationItem) => {
          quotesMap[q.serviceType] = q;
        });

        setQuotations(quotesMap);
        const current = quotesMap[selectedService] || data.quotations[0];
        setActiveQuotation(current);

        // Set countdown timer based on expiresAt (usually 5 mins)
        if (current?.expiresAt) {
          const expTime = new Date(current.expiresAt).getTime();
          const diffSec = Math.max(
            0,
            Math.floor((expTime - Date.now()) / 1000),
          );
          setTimeLeft(diffSec > 0 ? diffSec : 300);
        } else {
          setTimeLeft(300);
        }
      } catch (err: unknown) {
        console.error("Fetch quotation error:", err);
        const message = err instanceof Error ? err.message : t.quoteFailed;
        setErrorMsg(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [
      destinationAddress,
      destinationCoords,
      hostName,
      originAddress,
      originLat,
      originLng,
      selectedService,
      locale,
      t,
    ],
  );

  // Update active quote when user switches service type
  const handleSelectService = (serviceId: string) => {
    setSelectedService(serviceId);
    if (quotations[serviceId]) {
      setActiveQuotation(quotations[serviceId]);
    } else if (destinationAddress) {
      handleFetchQuotation([serviceId]);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Use current GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(
        locale === "en"
          ? "Browser does not support geolocation"
          : "您的瀏覽器不支援地理定位",
      );
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setDestinationCoords({ lat: latitude, lng: longitude });

        const fallbackLabel = t.gpsFallback(latitude, longitude);

        // Try reverse geocoding — gracefully skip if Geocoding API is not enabled
        if (window.google?.maps?.Geocoder) {
          try {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode(
              { location: { lat: latitude, lng: longitude } },
              (results, status) => {
                setIsLocating(false);
                if (status === "OK" && results?.[0]) {
                  setDestinationAddress(
                    sanitizeTwAddress(results[0].formatted_address),
                  );
                } else {
                  // Geocoding API disabled or no results — use coordinates directly
                  setDestinationAddress(fallbackLabel);
                }
                setErrorMsg(null);
              },
            );
          } catch {
            // Geocoding API not available or threw synchronously
            setIsLocating(false);
            setDestinationAddress(fallbackLabel);
            setErrorMsg(null);
          }
        } else {
          setIsLocating(false);
          setDestinationAddress(fallbackLabel);
          setErrorMsg(null);
        }
      },
      (err) => {
        setIsLocating(false);
        console.warn("Geolocation error:", err);
        toast.error(
          locale === "en"
            ? "Failed to obtain your location permission"
            : "無法獲取您當前的位置權限",
        );
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  // Format countdown mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const renderServiceIcon = (iconType: string, className = "h-5 w-5") => {
    switch (iconType) {
      case "bike":
        return <Bike className={className} />;
      case "van":
        return <Car className={className} />;
      case "truck":
      default:
        return <Truck className={className} />;
    }
  };

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 p-4 shadow-sm transition-all sm:p-5">
      {/* Header Bar */}
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-500/20">
            <Truck className="h-5 w-5 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="font-ddin text-[16px] font-bold leading-tight text-gray-900 sm:text-[17px]">
                {t.headerTitle}
              </h3>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 sm:text-[11px]">
                {t.headerBadge}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 sm:line-clamp-1 sm:text-[12px]">
              {t.headerSubtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-orange-600 transition-colors hover:bg-orange-100/60 sm:text-[13px]"
        >
          <span>{isExpanded ? t.collapse : t.expand}</span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <ChevronDown className="h-4 w-4 shrink-0" />
          </motion.div>
        </button>
      </div>

      {/* Quick summary preview if collapsed */}
      <AnimatePresence>
        {!isExpanded && activeQuotation && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="shadow-xs flex items-center justify-between gap-2 rounded-xl border border-orange-100 bg-white/80 px-3.5 py-2.5 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-gray-600">
                <span className="truncate font-medium text-gray-800">
                  {SERVICE_OPTIONS.find(
                    (s) => s.id === activeQuotation.serviceType,
                  )?.name[locale] || activeQuotation.serviceType}
                </span>
                <span className="shrink-0">•</span>
                <span className="shrink-0 whitespace-nowrap">
                  {t.approxDistance}{" "}
                  {(
                    Number(activeQuotation.distance?.value || 0) / 1000
                  ).toFixed(1)}{" "}
                  km
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap font-bold text-orange-600">
                  NT$ {activeQuotation.priceBreakdown?.total || 0}
                </span>
                <button
                  onClick={() => setIsExpanded(true)}
                  className="shrink-0 whitespace-nowrap text-xs text-orange-600 underline underline-offset-2"
                >
                  {t.change}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="lalamove-expanded-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-4 border-t border-orange-100/80 pt-3">
              {/* 1. Origin & Destination Inputs */}
              <div className="shadow-xs space-y-2.5 rounded-xl border border-gray-100 bg-white/90 p-3.5">
                {/* Origin (From Post) */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <MapPin className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-emerald-700">
                      {t.pickupOrigin}
                    </span>
                    <p
                      className="truncate text-xs font-medium text-gray-800"
                      title={originAddress}
                    >
                      {originAddress}
                    </p>
                  </div>
                </div>

                <div className="ml-2.5 h-3 border-l-2 border-dashed border-gray-200"></div>

                {/* Destination (User Input) */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                    <Navigation className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-orange-700">
                        {t.dropoffDestination}
                      </span>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
                      >
                        <Navigation className="h-3 w-3" />
                        {isLocating ? t.locating : t.useCurrentLocation}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        ref={destinationInputRef}
                        type="text"
                        value={destinationAddress}
                        onChange={(e) => {
                          setDestinationAddress(e.target.value);
                          setErrorMsg(null);
                        }}
                        placeholder={t.placeholderDestination}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 transition-all focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Vehicle Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  {t.selectVehicle}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SERVICE_OPTIONS.map((opt) => {
                    const isSelected = selectedService === opt.id;
                    const quote = quotations[opt.id];

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectService(opt.id)}
                        className={`relative flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition-all ${
                          isSelected
                            ? "shadow-xs border-2 border-orange-500 bg-orange-50/80 ring-1 ring-orange-400/20"
                            : "border border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/30"
                        }`}
                      >
                        <div
                          className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full ${
                            isSelected
                              ? "bg-orange-500 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {renderServiceIcon(opt.icon, "h-4 w-4")}
                        </div>
                        <span className="text-xs font-bold text-gray-800">
                          {opt.name[locale]}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {opt.weightLimit[locale]}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {opt.sizeLimit}
                        </span>

                        {quote && (
                          <span className="mt-1 font-ddin text-[13px] font-extrabold text-orange-600">
                            NT$ {quote.priceBreakdown?.total || 0}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Capacity Guide for Selected Vehicle */}
                {(() => {
                  const currentOpt = SERVICE_OPTIONS.find(
                    (s) => s.id === selectedService,
                  );
                  if (!currentOpt) return null;
                  return (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-orange-100/60 bg-orange-50/60 px-2.5 py-1.5 text-[11px] text-orange-800">
                      <span className="font-medium">
                        {t.capacityLimit(
                          currentOpt.name[locale],
                          currentOpt.sizeLimit,
                          currentOpt.weightLimit[locale],
                        )}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Action Button if quotation not yet fetched */}
              {(!activeQuotation || errorMsg) && (
                <button
                  type="button"
                  onClick={() => handleFetchQuotation()}
                  disabled={loading || !destinationAddress.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 font-ddin text-sm font-bold text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RotateCw className="h-4 w-4 animate-spin" />
                      {t.calculating}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t.calcButton}
                    </>
                  )}
                </button>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 3. Quotation Result Card */}
              <AnimatePresence initial={false}>
                {activeQuotation && (
                  <motion.div
                    key="lalamove-expanded-content"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border border-orange-200/80 bg-white p-4 shadow-sm">
                      <div className="flex items-end justify-between gap-3 border-b border-gray-100 pb-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-gray-500">
                            {t.estimatedFare}
                          </span>
                          <div className="mt-0.5 flex items-baseline gap-1">
                            <span className="text-xs font-bold text-orange-600">
                              NT$
                            </span>
                            <span className="font-ddin text-3xl font-extrabold tracking-tight text-orange-600">
                              {activeQuotation.priceBreakdown?.total || 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end pb-0.5 text-xs text-gray-600">
                          <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-gray-700">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span>
                              {t.approxDeliveryTime(
                                activeQuotation.durationMins || 15,
                              )}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-gray-500">
                            <Navigation className="h-3 w-3 shrink-0 text-gray-400" />
                            <span>
                              {t.distanceLabel(
                                (
                                  Number(activeQuotation.distance?.value || 0) /
                                  1000
                                ).toFixed(1),
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Price Breakdown Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowBreakdown(!showBreakdown)}
                          className="flex w-full items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          <span className="flex items-center gap-1">
                            <Info className="h-3.5 w-3.5" />
                            {t.priceBreakdown}
                          </span>
                          <motion.div
                            animate={{ rotate: showBreakdown ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </motion.div>
                        </button>

                        <AnimatePresence>
                          {showBreakdown && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                                <div className="flex justify-between">
                                  <span>{t.baseFare}</span>
                                  <span>
                                    NT${" "}
                                    {activeQuotation.priceBreakdown?.base || 75}
                                  </span>
                                </div>
                                {Number(
                                  activeQuotation.priceBreakdown
                                    ?.extraMileage || 0,
                                ) > 0 && (
                                  <div className="flex justify-between">
                                    <span>{t.extraMileageFare}</span>
                                    <span>
                                      NT${" "}
                                      {
                                        activeQuotation.priceBreakdown
                                          ?.extraMileage
                                      }
                                    </span>
                                  </div>
                                )}
                                {Number(
                                  activeQuotation.priceBreakdown?.surcharge ||
                                    0,
                                ) > 0 && (
                                  <div className="flex justify-between">
                                    <span>{t.surchargeFare}</span>
                                    <span>
                                      NT${" "}
                                      {
                                        activeQuotation.priceBreakdown
                                          ?.surcharge
                                      }
                                    </span>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Validity Countdown & Re-calculate */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          {timeLeft !== null && timeLeft > 0 ? (
                            <span>
                              {t.quoteValidCountdown}
                              <span className="font-mono font-bold text-orange-600">
                                {formatTimer(timeLeft)}
                              </span>
                            </span>
                          ) : (
                            <span className="font-medium text-red-500">
                              {t.quoteExpired}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleFetchQuotation()}
                          disabled={loading}
                          className="flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                        >
                          <RotateCw
                            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                          />
                          {t.recalculate}
                        </button>
                      </div>

                      {/* 4. Book / Call Lalamove Driver Button */}
                      <button
                        type="button"
                        onClick={() => setIsOrderModalOpen(true)}
                        disabled={timeLeft === 0}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-ddin text-sm font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Truck className="h-4 w-4" />
                        <span>
                          {locale === "en"
                            ? `Book Lalamove (NT$ ${activeQuotation.priceBreakdown?.total || 0})`
                            : `立即呼叫 Lalamove (NT$ ${activeQuotation.priceBreakdown?.total || 0})`}
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Placement Modal */}
      <OrderPlacementModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        quotation={activeQuotation}
        post={post}
        originAddress={originAddress}
        destinationAddress={destinationAddress}
        currentUser={user}
        locale={locale}
      />
    </div>
  );
};

export default LalamoveQuotation;
