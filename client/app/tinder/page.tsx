"use client";

import React, { useState, useEffect, useTransition } from "react";
import TinderFeed from "../components/TinderFeed/TinderFeed";
import { Slider } from "@/components/ui/slider";
import { useLocation } from "../contexts/LocationContext";
import { DISTANCE_TIERS, DistanceTier } from "@/utils/tinderAlgorithm";
import { MapPin, Navigation, Compass } from "lucide-react";

export default function TinderPage() {
  const { coords, requestLocation, loading: locationLoading } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();

  // 1. 即時 UI 滑桿顯示索引 (0 ~ 4)
  const [sliderIndex, setSliderIndex] = useState<number>(4);
  // 2. 實際傳入演算法重排的級距索引 (經過防抖處理，避免手機快速滑動時每秒重算 120 次)
  const [appliedTierIndex, setAppliedTierIndex] = useState<number>(4);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 拖曳防抖：手指快速滑過時，延遲 120ms 才進行卡片陣列過濾與重排
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setAppliedTierIndex(sliderIndex);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [sliderIndex]);

  // 點擊刻度按鈕直接切換
  const handleDirectSelect = (idx: number) => {
    setSliderIndex(idx);
    startTransition(() => {
      setAppliedTierIndex(idx);
    });
  };

  // 採用固定標準生活圈 5 級距，保證刻度與半徑絕對穩定不隨背景分頁載入而跳動
  const tiers: DistanceTier[] = DISTANCE_TIERS;
  const currentDisplayTier = tiers[sliderIndex] || tiers[tiers.length - 1];
  const currentAppliedTier = tiers[appliedTierIndex] || tiers[tiers.length - 1];
  const maxDistanceKm = currentAppliedTier.distanceKm;

  return (
    <>
      {/* Ambient background styling */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#f8f9f6] via-[#f2f4ef] to-[#e8ede4]" />

      {/* Main Container */}
      <main className="relative flex min-h-[calc(100dvh-64px)] w-full flex-col items-center justify-start overflow-x-hidden px-2 pt-2 sm:px-4 sm:pt-3">
        {/* Top Search Radius 5-Tier Slider Control Card */}
        <div className="z-40 flex w-full max-w-md flex-col gap-2 rounded-2xl border border-stone-200/80 bg-white/85 px-4 py-3 font-ddin shadow-sm backdrop-blur-md transition-all">
          {/* Header Row: Label + Active Radius Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
              <Compass className="h-4 w-4 text-emerald-600" />
              <span>搜尋半徑級距</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                <MapPin className="h-3 w-3" />
                {currentDisplayTier.badgeLabel}
              </span>
            </div>
          </div>

          {/* 5-Step Shadcn UI Slider */}
          <div className="py-1">
            <Slider
              value={[sliderIndex]}
              min={0}
              max={4}
              step={1}
              onValueChange={(val) => setSliderIndex(val[0])}
              onValueCommit={(val) => {
                setSliderIndex(val[0]);
                startTransition(() => {
                  setAppliedTierIndex(val[0]);
                });
              }}
              className="cursor-pointer"
            />
          </div>

          {/* 5-Tier Scale Ticks & Location Status */}
          <div className="flex items-center justify-between font-ddin text-[11px] text-stone-400">
            {tiers.map((t, idx) => {
              const isActive = sliderIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleDirectSelect(idx)}
                  className={`rounded px-1 py-0.5 transition-all hover:text-stone-800 ${
                    isActive
                      ? "font-extrabold text-megaweave-forest underline underline-offset-4"
                      : "text-stone-400"
                  }`}
                  title={`${t.label} • ${t.desc}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Location Status Indicator */}
          <div className="flex items-center justify-between border-t border-stone-100 pt-1.5 font-ddin text-[11px] text-stone-500">
            <div className="flex items-center gap-1">
              <Navigation
                className={`h-3 w-3 ${
                  mounted && coords ? "text-emerald-500" : "text-amber-500"
                }`}
              />
              <span suppressHydrationWarning>
                {!mounted
                  ? "GPS 定位"
                  : coords
                    ? "已套用 GPS 定位"
                    : locationLoading
                      ? "定位中..."
                      : "未定位"}
              </span>
            </div>

            {mounted && !coords && (
              <button
                onClick={() => requestLocation()}
                disabled={locationLoading}
                className="font-semibold text-emerald-700 hover:underline disabled:opacity-50"
              >
                (點此啟用)
              </button>
            )}
          </div>
        </div>

        {/* Tinder Deck Component */}
        <TinderFeed
          maxDistanceKm={maxDistanceKm}
        />
      </main>
    </>
  );
}
