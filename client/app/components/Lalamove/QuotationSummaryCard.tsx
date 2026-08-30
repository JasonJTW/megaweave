"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Navigation, Info, ChevronDown, RotateCw, MapPin } from "lucide-react";
import { QuoteCountdown } from "./QuoteCountdown";

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
  distance?: {
    value: string;
    unit: string;
  };
  durationMins?: number;
  stops?: Array<{
    id?: string;
    coordinates: {
      lat: string | number;
      lng: string | number;
    };
    address: string;
  }>;
}

export interface QuotationSummaryCardProps {
  quotation: QuotationItem;
  locale?: "en" | "zh";
  postTitle?: string;
  vehicleName?: string;
  originAddress?: string;
  destinationAddress?: string;
  onExpireChange?: (isExpired: boolean) => void;
  onRecalculate?: () => void;
  isRecalculating?: boolean;
  showBreakdownToggle?: boolean;
  showDurationAndDistance?: boolean;
  showSmallRecalculateButton?: boolean;
  actionButton?: React.ReactNode;
  variant?: "card" | "pill";
  className?: string;
}

export const QuotationSummaryCard: React.FC<QuotationSummaryCardProps> = ({
  quotation,
  locale = "zh",
  postTitle,
  vehicleName,
  originAddress,
  destinationAddress,
  onExpireChange,
  onRecalculate,
  isRecalculating = false,
  showBreakdownToggle = true,
  showDurationAndDistance = true,
  showSmallRecalculateButton = false,
  actionButton,
  variant = "card",
  className = "",
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const t = {
    en: {
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
      item: "Item: ",
    },
    zh: {
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
      item: "物品：",
    },
  }[locale];

  const distanceKm = (
    Number(quotation.distance?.value || 0) / 1000
  ).toFixed(1);
  const durationMins = quotation.durationMins || 15;

  const containerClasses =
    variant === "pill"
      ? `rounded-2xl border border-orange-200/80 bg-orange-50/50 p-3.5 ${className}`
      : `space-y-3 rounded-xl border border-orange-200/80 bg-white p-4 shadow-sm ${className}`;

  return (
    <div className={containerClasses}>
      {/* Top Header: Price & Route Info */}
      <div className="flex items-end justify-between gap-3 border-b border-gray-100/80 pb-3">
        <div className="min-w-0 flex-1">
          {vehicleName ? (
            <div className="mb-0.5">
              <span className="text-xs font-semibold text-orange-800">
                {vehicleName} 配送
              </span>
              {postTitle && (
                <p className="mt-0.5 line-clamp-1 text-xs text-gray-600">
                  {t.item}{postTitle}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs font-medium text-gray-500">
              {t.estimatedFare}
            </span>
          )}

          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xs font-bold text-orange-600">NT$</span>
            <span className="font-ddin text-2xl font-extrabold tracking-tight text-orange-600 sm:text-3xl">
              {quotation.priceBreakdown?.total || 0}
            </span>
          </div>
        </div>

        {showDurationAndDistance && (
          <div className="flex shrink-0 flex-col items-end pb-0.5 text-xs text-gray-600">
            <div className="flex items-center gap-1.5 whitespace-nowrap font-medium text-gray-700">
              <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span>{t.approxDeliveryTime(durationMins)}</span>
            </div>
            {Number(quotation.distance?.value || 0) > 0 && (
              <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-gray-500">
                <Navigation className="h-3 w-3 shrink-0 text-gray-400" />
                <span>{t.distanceLabel(distanceKm)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Route Addresses (Origin -> Destination) */}
      {(() => {
        const orig = originAddress || quotation.stops?.[0]?.address;
        const dest = destinationAddress || quotation.stops?.[1]?.address;
        if (!orig && !dest) return null;
        return (
          <div className="space-y-1 rounded-lg bg-gray-50/90 p-2.5 text-xs">
            {orig && (
              <div className="flex items-start gap-1.5">
                <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <MapPin className="h-2 w-2" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-gray-500">
                    {locale === "en" ? "Pickup: " : "取件："}
                  </span>
                  <span className="text-gray-700">{orig}</span>
                </div>
              </div>
            )}
            {dest && (
              <div className="flex items-start gap-1.5">
                <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                  <MapPin className="h-2 w-2" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-gray-500">
                    {locale === "en" ? "Drop-off: " : "送達："}
                  </span>
                  <span className="text-gray-700">{dest}</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Price Breakdown Collapsible */}
      {showBreakdownToggle && (
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
                      NT$ {quotation.priceBreakdown?.base || 75}
                    </span>
                  </div>
                  {Number(quotation.priceBreakdown?.extraMileage || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>{t.extraMileageFare}</span>
                      <span>
                        NT$ {quotation.priceBreakdown?.extraMileage}
                      </span>
                    </div>
                  )}
                  {Number(quotation.priceBreakdown?.surcharge || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>{t.surchargeFare}</span>
                      <span>
                        NT$ {quotation.priceBreakdown?.surcharge}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Validity Countdown Row */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <QuoteCountdown
          expiresAt={quotation.expiresAt}
          labelCountdown={t.quoteValidCountdown}
          labelExpired={t.quoteExpired}
          onExpireChange={onExpireChange}
        />

        {showSmallRecalculateButton && onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={isRecalculating}
            className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
          >
            <RotateCw
              className={`h-3 w-3 ${isRecalculating ? "animate-spin" : ""}`}
            />
            <span>{t.recalculate}</span>
          </button>
        )}
      </div>

      {/* Action Button Slot (Optional) */}
      {actionButton && <div className="pt-1">{actionButton}</div>}
    </div>
  );
};

export default QuotationSummaryCard;
