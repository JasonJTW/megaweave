"use client";

import { useRouter } from "@/i18n/navigation";
import React, { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { Post } from "@/app/types/schema";
import {
  Truck,
  MapPin,
  Navigation,
  RotateCw,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Van,
  Bike,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import OrderPlacementModal from "./OrderPlacementModal";
import QuotationSummaryCard from "./QuotationSummaryCard";
import { useUser } from "@/app/contexts/UserContext";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import { ArrowRight } from "lucide-react";
import WeavingIcon from "@/app/components/icons/WeavingIcon";
import { hasPendingWeaveForPost, getLalamoveAction } from "@/utils/weaveGuard";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  VEHICLE_TYPES,
  VEHICLE_SIZE_LIMITS,
  VehicleType,
  isVehicleType,
  LALAMOVE_LANGUAGE,
} from "@/utils/lalamove";
import {
  parseGooglePlace,
  GOOGLE_AUTOCOMPLETE_FIELDS,
  ParsedGooglePlace,
} from "@/utils/locationUtils";

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

export interface LalamoveQuotationProps {
  post: Post;
  /** Caller already knows a approved weave exists (e.g. rendered under a approved WeavingCard); skips the lookup. */
  hasPendingWeave?: boolean;
}

const SERVICE_ICONS: Record<VehicleType, "bike" | "van" | "truck"> = {
  MOTORCYCLE: "bike",
  SUV: "van",
  VAN: "van",
  TRUCK175: "truck",
  TRUCK330: "truck",
};

// FIXME: [Lalamove TW API Regional Limitation]
// FIXME In Taipei (TW_TPE), Lalamove API only supports TRUCK330 (merging 1.75T & 3.49T into 500-1000kg).
// FIXME Therefore, requesting TRUCK175 in Taipei falls back to TRUCK330 pricing (same price). Waiting for Lalamove support to clarify if 1.75T can be differentiated.

export interface QuotationItem {
  quotationId: string;
  serviceType: string;
  serviceName?: string;
  serviceDescription?: string;
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
  hasPendingWeave: hasPendingWeaveProp,
}) => {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";
  const t = useTranslations("Lalamove");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Destination input
  const destinationInputRef = useRef<HTMLInputElement | null>(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationPlaceId, setDestinationPlaceId] = useState<
    string | undefined
  >(undefined);
  const [destinationCoords, setDestinationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [destinationDetails, setDestinationDetails] =
    useState<ParsedGooglePlace | null>(null);

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
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);
  // Auto-expand when returning from /signin with ?expand=1
  const [isExpanded, setIsExpanded] = useState(
    () => searchParams.get("expand") === "1",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { user } = useUser();
  const { openChat } = useChatPopup();
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Weaves query to check if there is a approved weave for this post
  const { data: weavesData } = useSWR(
    user && hasPendingWeaveProp === undefined
      ? `${hostName}/api/weaves?postId=${post.id}&status=approved`
      : null,
    async (url: string) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  );

  const hasPendingWeave =
    hasPendingWeaveProp ?? hasPendingWeaveForPost(weavesData?.weaves, post.id);

  const handleWeaveThisClick = async () => {
    if (!user) {
      toast.error(t("quotation.signInToMessage"));
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
      );
      return;
    }

    if (user.userId === (post.author_user_id ?? post.user_id)) {
      toast.error(t("quotation.cannotMessageSelf"));
      return;
    }

    try {
      const res = await fetch(`${hostName}/api/messages/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipient_public_id: post.author_public_id }),
      });

      if (!res.ok) throw new Error("Failed to start conversation");

      const data = await res.json();

      openChat(
        data.conversationId,
        {
          public_id: post.author_public_id,
          username: post.username,
          avatar_url: post.avatar_url,
        },
        post,
        { id: "all", title: "All" },
      );
    } catch (error) {
      console.error("Message error:", error);
      toast.error(t("quotation.messageFailed", { username: post.username }));
    }
  };

  // Origin info from post (allows overriding from modal)
  const [customOriginAddress, setCustomOriginAddress] = useState<string | null>(
    null,
  );
  const originAddress =
    customOriginAddress ||
    post.full_address ||
    post.location_name ||
    post.city ||
    (post.province
      ? `${post.province} ${post.city || ""}`
      : t("quotation.fallbackOrigin"));

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
          fields: GOOGLE_AUTOCOMPLETE_FIELDS,
        },
      );

      const listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const parsed = parseGooglePlace(place);
        setDestinationDetails(parsed);

        if (parsed.full_address) {
          setDestinationAddress(parsed.full_address);
          setErrorMsg(null);
        }

        if (parsed.place_id) {
          setDestinationPlaceId(parsed.place_id);
        }

        if (parsed.lat !== undefined && parsed.lng !== undefined) {
          setDestinationCoords({
            lat: parsed.lat,
            lng: parsed.lng,
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
    async (serviceTypesToFetch?: string[], targetServiceToSelect?: string) => {
      if (!destinationAddress.trim()) {
        setErrorMsg(t("quotation.inputAddressError"));
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      setIsQuoteExpired(false);

      const targetTypes =
        serviceTypesToFetch && serviceTypesToFetch.length > 0
          ? serviceTypesToFetch
          : [...VEHICLE_TYPES];

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
            serviceTypes: targetTypes,
            stops,
            language: LALAMOVE_LANGUAGE,
          }),
        });

        const data = await response.json();
        console.log("[Lalamove Client] Received quotation data:", data);

        if (!response.ok || !data.success) {
          throw new Error(data.error || t("quotation.quoteFailed"));
        }

        const quotesMap: Record<string, QuotationItem> = {};
        data.quotations.forEach((q: QuotationItem) => {
          quotesMap[q.serviceType] = q;
        });

        // 雙北與中南部的貨車代碼互補（TRUCK330 與 TRUCK175）
        if (quotesMap["TRUCK330"] && !quotesMap["TRUCK175"]) {
          quotesMap["TRUCK175"] = {
            ...quotesMap["TRUCK330"],
            serviceType: "TRUCK175",
          };
        }
        if (quotesMap["TRUCK175"] && !quotesMap["TRUCK330"]) {
          quotesMap["TRUCK330"] = {
            ...quotesMap["TRUCK175"],
            serviceType: "TRUCK330",
          };
        }

        // 合併現有報價，避免覆蓋其他車型按鈕上的金額
        setQuotations((prev) => ({
          ...prev,
          ...quotesMap,
        }));

        const activeServiceId = targetServiceToSelect || selectedService;
        const current =
          quotesMap[activeServiceId] ||
          (activeServiceId === "TRUCK175"
            ? quotesMap["TRUCK330"]
            : undefined) ||
          (activeServiceId === "TRUCK330"
            ? quotesMap["TRUCK175"]
            : undefined) ||
          data.quotations[0];
        if (current) {
          setActiveQuotation(current);
          toast.success(t("quotation.quoteUpdated"));
        }
      } catch (err: unknown) {
        console.error("Fetch quotation error:", err);
        const message =
          err instanceof Error ? err.message : t("quotation.quoteFailed");
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
      t,
    ],
  );

  // Expired callback from QuoteCountdown
  const handleExpireChange = useCallback((expired: boolean) => {
    setIsQuoteExpired(expired);
  }, []);

  // Update active quote when user switches service type
  const handleSelectService = (serviceId: string) => {
    setSelectedService(serviceId);
    const existing =
      quotations[serviceId] ||
      (serviceId === "TRUCK175" ? quotations["TRUCK330"] : undefined) ||
      (serviceId === "TRUCK330" ? quotations["TRUCK175"] : undefined);

    if (existing) {
      setActiveQuotation(existing);
    } else if (destinationAddress) {
      // 點擊任何車型按鈕皆批量請求所有車型報價，確保所有按鈕同時顯示金額
      handleFetchQuotation(undefined, serviceId);
    }
  };

  // Use current GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("quotation.geolocationUnsupported"));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setDestinationCoords({ lat: latitude, lng: longitude });

        const fallbackLabel = t("quotation.gpsFallback", {
          lat: latitude.toFixed(4),
          lng: longitude.toFixed(4),
        });

        // Try reverse geocoding — gracefully skip if Geocoding API is not enabled
        if (window.google?.maps?.Geocoder) {
          try {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode(
              { location: { lat: latitude, lng: longitude } },
              (results, status) => {
                setIsLocating(false);
                if (status === "OK" && results?.[0]) {
                  const parsed = parseGooglePlace(
                    results[0] as unknown as google.maps.places.PlaceResult,
                  );
                  setDestinationDetails(parsed);
                  setDestinationAddress(
                    sanitizeTwAddress(
                      parsed.full_address || results[0].formatted_address,
                    ),
                  );
                  if (results[0].place_id) {
                    setDestinationPlaceId(results[0].place_id);
                  }
                } else {
                  setDestinationDetails(null);
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
        toast.error(t("quotation.geolocationFailed"));
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const renderServiceIcon = (iconType: string, className = "h-5 w-5") => {
    switch (iconType) {
      case "bike":
        return <Bike className={className} />;
      case "van":
        return <Van className={className} />;
      case "truck":
      default:
        return <Truck className={className} />;
    }
  };

  const lalamoveAction = getLalamoveAction({
    isQuoteExpired,
    hasPendingWeave,
  });

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
                {t("quotation.headerTitle")}
              </h3>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 sm:text-[11px]">
                {t("quotation.headerBadge")}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 sm:line-clamp-1 sm:text-[12px]">
              {t("quotation.headerSubtitle")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            // 嘗試展開時先確認已登入；未登入則導向登入頁並帶 returnTo + expand=1
            if (!isExpanded && !user) {
              const currentPath =
                typeof window !== "undefined"
                  ? window.location.pathname + window.location.search
                  : "/";
              // 在 returnTo 的 URL 裡附加 ?expand=1，登入後自動展開
              const separator = currentPath.includes("?") ? "&" : "?";
              const returnTo = encodeURIComponent(
                `${currentPath}${separator}expand=1`,
              );
              toast(t("quotation.signInForQuote"), { icon: "🔑" });
              router.push(`/signin?returnTo=${returnTo}`);
              return;
            }
            setIsExpanded(!isExpanded);
          }}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-orange-600 transition-colors hover:bg-orange-100/60 sm:text-[13px]"
        >
          <span>
            {isExpanded ? t("quotation.collapse") : t("quotation.expand")}
          </span>
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
                  {isVehicleType(activeQuotation.serviceType)
                    ? t(`vehicles.${activeQuotation.serviceType}.name`)
                    : activeQuotation.serviceType}
                </span>
                <span className="shrink-0">•</span>
                <span className="shrink-0 whitespace-nowrap">
                  {t("quotation.approxDistance", {
                    km: (
                      Number(activeQuotation.distance?.value || 0) / 1000
                    ).toFixed(1),
                  })}
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
                  {t("quotation.change")}
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
                      {t("quotation.pickupOrigin")}
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
                        {t("quotation.dropoffDestination")}
                      </span>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
                      >
                        <Navigation className="h-3 w-3" />
                        {isLocating
                          ? t("quotation.locating")
                          : t("quotation.useCurrentLocation")}
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
                        placeholder={t("quotation.placeholderDestination")}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 transition-all focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Vehicle Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  {t("quotation.selectVehicle")}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VEHICLE_TYPES.map((id) => {
                    const isSelected = selectedService === id;
                    const quote =
                      quotations[id] ||
                      (id === "TRUCK175"
                        ? quotations["TRUCK330"]
                        : undefined) ||
                      (id === "TRUCK330" ? quotations["TRUCK175"] : undefined);

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelectService(id)}
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
                          {renderServiceIcon(SERVICE_ICONS[id], "h-4 w-4")}
                        </div>
                        <span className="text-xs font-bold text-gray-800">
                          {t(`vehicles.${id}.name`)}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {t(`vehicles.${id}.weightLimit`)}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {VEHICLE_SIZE_LIMITS[id]}
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
                {isVehicleType(selectedService) && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-orange-100/60 bg-orange-50/60 px-2.5 py-1.5 text-[11px] text-orange-800">
                    <span className="font-medium">
                      {t("quotation.capacityLimit", {
                        vehicle: t(`vehicles.${selectedService}.name`),
                        size: VEHICLE_SIZE_LIMITS[selectedService],
                        weight: t(`vehicles.${selectedService}.weightLimit`),
                      })}
                    </span>
                  </div>
                )}
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
                      {t("quotation.calculating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t("quotation.calcButton")}
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

              {/* 3. Quotation Result Card (Shared Component) */}
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
                    <QuotationSummaryCard
                      quotation={activeQuotation}
                      originAddress={originAddress}
                      destinationAddress={destinationAddress}
                      onExpireChange={handleExpireChange}
                      actionButton={
                        lalamoveAction === "recalculate" ? (
                          <button
                            type="button"
                            onClick={() => handleFetchQuotation()}
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 font-ddin text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:from-amber-600 hover:to-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RotateCw
                              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                            />
                            <span>
                              {loading
                                ? t("quotation.calculating")
                                : t("quoteExpiredRecalculate")}
                            </span>
                          </button>
                        ) : lalamoveAction === "weave_this" ? (
                          <button
                            type="button"
                            onClick={handleWeaveThisClick}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 font-ddin text-sm font-semibold tracking-wider text-white shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.99]"
                          >
                            <WeavingIcon className="!h-[19px] !w-[19px] text-white" />
                            <span>{t("quotation.weaveThis")}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsOrderModalOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-ddin text-sm font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Truck className="h-4 w-4" />
                            <span>
                              {t("quotation.bookLalamove", {
                                total:
                                  activeQuotation.priceBreakdown?.total || 0,
                              })}
                            </span>
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )
                      }
                    />
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
        allQuotations={quotations}
        onQuotationsUpdate={(quotes, active, newOrigin, newDest) => {
          setQuotations(quotes);
          if (active) {
            setActiveQuotation(active);
            setSelectedService(active.serviceType);
          }
          if (newOrigin) setCustomOriginAddress(newOrigin);
          if (newDest) setDestinationAddress(newDest);
        }}
        post={post}
        originAddress={originAddress}
        destinationAddress={destinationAddress}
        destinationPlaceId={destinationPlaceId}
        destinationCoords={destinationCoords || undefined}
        initialDestinationDetails={destinationDetails || undefined}
        currentUser={user}
      />
    </div>
  );
};
export const LalamoveQuotationMemo = React.memo(LalamoveQuotation);
export default LalamoveQuotationMemo;
