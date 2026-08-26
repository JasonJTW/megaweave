"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo, MotionValue } from "framer-motion";
import Image from "next/image";
import type { Post } from "../../types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { getPostDistance } from "@/utils/locationUtils";
import { useLocation } from "../../contexts/LocationContext";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import TagIcon from "../icons/TagIcon";
import LocationIcon from "../icons/LocationIcon";
import ElfIcon from "../icons/ElfIcon";
import WazowskiIcon from "../icons/WazowskiIcon";
import { Info, ChevronLeft, ChevronRight, Package } from "lucide-react";
import ReuseIcon from "../icons/ReuseIcon";

// Duration each card is shown before auto-advancing (seconds)
const AUTO_ADVANCE_SECS = 8;

interface TinderCardProps {
  post: Post;
  isTop: boolean;
  indexInStack: number;
  dragX: MotionValue<number>;
  onSwipe: (direction: "left" | "right") => void;
  onDetailClick: (post: Post) => void;
  forcedDirection?: "left" | "right" | null;
}

export default function TinderCard({
  post,
  isTop,
  indexInStack,
  dragX,
  onSwipe,
  onDetailClick,
  forcedDirection,
}: TinderCardProps) {
  const { coords } = useLocation();
  const distanceStr = getPostDistance(coords, post.lat, post.lng);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);

  const s3Keys = parseS3Keys(post);
  const totalImages = s3Keys.length;

  // Pre-calculate image URLs (optimized thumbnails)
  const imageUrls = React.useMemo(() => {
    return s3Keys.map((key) => {
      if (!key) return "";
      return key.startsWith("http") ? key : getImageUrl(key, "medium");
    });
  }, [s3Keys]);

  // Motion values for drag & rotation (GPU accelerated)
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-18, 18]);

  // For top card: keep the shared dragX in sync so under-cards can respond in real-time
  useTransform(x, (v) => { if (isTop) dragX.set(v); return v; });

  // 隨著左右拖曳接近 SWIPE_THRESHOLD 平滑降低卡片透明度 (純 GPU 合成，不觸發 CPU/GPU 重繪)
  const cardDragOpacity = useTransform(
    x,
    [-400, -300, -160, 0, 160, 300, 400],
    [0.2, 0.5, 0.85, 1, 0.85, 0.5, 0.2],
  );

  // 隨著左右拖曳接近 SWIPE_THRESHOLD 產生高光過曝效果 (提高亮度並淡化暗部對比，純 GPU 合成零重繪)
  const dragHighlightOpacity = useTransform(
    x,
    [-260, -140, 0, 140, 260],
    [0.35, 0.18, 0, 0.18, 0.35],
  );

  // Stamp opacities
  const likeOpacity = useTransform(x, [25, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -25], [1, 0]);

  // ─── Auto-advance timer ───────────────────────────────────────────────────
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const currentImageIndexRef = useRef(currentImageIndex);
  useEffect(() => {
    currentImageIndexRef.current = currentImageIndex;
  }, [currentImageIndex]);

  const startAutoAdvance = useCallback(() => {
    clearAutoAdvance();
    if (!isTop) return;
    autoAdvanceRef.current = setTimeout(() => {
      const idx = currentImageIndexRef.current;
      const total = s3Keys.length;
      if (total > 1 && idx < total - 1) {
        setCurrentImageIndex((prev) => prev + 1);
        setProgressKey((k) => k + 1);
        startAutoAdvance();
      }
    }, AUTO_ADVANCE_SECS * 1000);
  }, [isTop, s3Keys.length, clearAutoAdvance]);

  useEffect(() => {
    if (isTop && !isDragging && !forcedDirection && !exitDir) {
      startAutoAdvance();
    } else {
      clearAutoAdvance();
    }
    return clearAutoAdvance;
  }, [
    isTop,
    isDragging,
    forcedDirection,
    exitDir,
    startAutoAdvance,
    clearAutoAdvance,
  ]);

  useEffect(() => {
    if (forcedDirection) {
      clearAutoAdvance();
    }
  }, [forcedDirection, clearAutoAdvance]);

  useEffect(() => {
    if (!exitDir) return;
    const t = setTimeout(() => {
      onSwipe(exitDir);
    }, 350);
    return () => clearTimeout(t);
  }, [exitDir, onSwipe]);

  // Drag End handler
  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    setIsDragging(false);

    const SWIPE_THRESHOLD = 180; // px
    const SNAP_BACK_ZONE = 140; // px
    const VELOCITY_THRESHOLD = 500; // px/s

    const offsetX = info.offset.x;
    const velocityX = info.velocity.x;

    if (Math.abs(offsetX) < SNAP_BACK_ZONE) {
      startAutoAdvance();
      return;
    }

    const commitExit = (dir: "left" | "right") => {
      clearAutoAdvance();
      setExitDir(dir);
    };

    if (offsetX > SWIPE_THRESHOLD) {
      commitExit("right");
    } else if (offsetX < -SWIPE_THRESHOLD) {
      commitExit("left");
    } else if (velocityX > VELOCITY_THRESHOLD && offsetX > 0) {
      commitExit("right");
    } else if (velocityX < -VELOCITY_THRESHOLD && offsetX < 0) {
      commitExit("left");
    } else {
      startAutoAdvance();
    }
  };

  // Switch image inside card
  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentImageIndex > 0) {
      clearAutoAdvance();
      setCurrentImageIndex((prev) => prev - 1);
      setProgressKey((k) => k + 1);
      startAutoAdvance();
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentImageIndex < totalImages - 1) {
      clearAutoAdvance();
      setCurrentImageIndex((prev) => prev + 1);
      setProgressKey((k) => k + 1);
      startAutoAdvance();
    }
  };

  // Stack styling for cards underneath (keep 100% solid opacity so they don't look transparent behind top card)
  // Under-card scale and y are driven by the top card's dragX so they grow in real-time as the user drags
  const baseScale = 1 - indexInStack * 0.04;   // resting scale (e.g. 0.96 for index 1)
  const baseY = indexInStack * 10;              // resting vertical offset
  const undercardScale = useTransform(
    dragX,
    [-200, 0, 200],
    isTop ? [1, 1, 1] : [baseScale + 0.04, baseScale, baseScale + 0.04],
  );
  const undercardY = useTransform(
    dragX,
    [-200, 0, 200],
    isTop ? [0, 0, 0] : [Math.max(0, baseY - 10), baseY, Math.max(0, baseY - 10)],
  );
  const opacity = indexInStack > 2 ? 0 : 1;
  const zIndex = 30 - indexInStack;

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;

  const isWish = post.type === "wish";
  const activeImageUrl = isTop
    ? imageUrls[currentImageIndex] || imageUrls[0]
    : imageUrls[0];

  return (
    <motion.div
      style={{
        zIndex,
        opacity: isTop ? cardDragOpacity : opacity,
        ...(isTop
          ? { x, y, rotate }
          : { scale: undercardScale, y: undercardY }),
        willChange: "transform, opacity",
      }}
      drag={isTop && !exitDir}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={isTop ? handleDragEnd : undefined}
      animate={(() => {
        if (isTop && exitDir) {
          return {
            x: exitDir === "right" ? 900 : -900,
            rotate: exitDir === "right" ? 25 : -25,
            opacity: 0,
            transition: { duration: 0.32, ease: [0.32, 0, 0.67, 0] as const },
          };
        }
        if (isTop && forcedDirection) {
          return {
            x: forcedDirection === "right" ? 900 : -900,
            rotate: forcedDirection === "right" ? 25 : -25,
            opacity: 0,
            transition: { duration: 0.38, ease: [0.32, 0, 0.67, 0] as const },
          };
        }
        if (isTop) return { scale: 1, y: 0 };
        return { scale: baseScale, y: baseY };
      })()}
      transition={
        isTop && (forcedDirection || exitDir)
          ? { duration: 0.38 }
          : { type: "spring", stiffness: 280, damping: 26 }
      }
      className={`absolute inset-0 flex select-none flex-col justify-between overflow-hidden rounded-[28px] border border-stone-200/80 bg-[#161c15] shadow-xl ${
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      {/* ─── Story Style Progress Bars (top, always shown for top card) ─── */}
      {isTop && totalImages > 1 && (
        <div className="absolute left-0 right-0 top-3 z-30 flex gap-1.5 px-4">
          {imageUrls.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-black/40"
            >
              {i < currentImageIndex ? (
                <div className="h-full w-full bg-white/80" />
              ) : i === currentImageIndex ? (
                <div
                  key={`prog-${progressKey}-${i}`}
                  className="h-full bg-white"
                  style={{
                    animation:
                      isDragging || forcedDirection
                        ? "none"
                        : `storyProgress ${AUTO_ADVANCE_SECS}s linear forwards`,
                    width: isDragging || forcedDirection ? "100%" : undefined,
                  }}
                />
              ) : (
                <div className="h-full w-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Swipe Feedback Stamps (LIKE / NOPE) ─── */}
      {isTop && (
        <>
          <motion.div
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute left-6 top-8 z-40 -rotate-12 rounded-xl border-[3px] border-emerald-400 bg-emerald-950/85 px-4 py-1.5 text-center shadow-lg"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-emerald-400">
              LIKE +1
            </span>
          </motion.div>

          <motion.div
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-6 top-8 z-40 rotate-12 rounded-xl border-[3px] border-rose-500 bg-rose-950/85 px-4 py-1.5 text-center shadow-lg"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-rose-500">
              PASS
            </span>
          </motion.div>
        </>
      )}

      {/* ─── Main Image & Background Layer (Ultra Lightweight GPU Friendly) ─── */}
      <div className="relative h-full w-full flex-1 overflow-hidden bg-gradient-to-b from-[#222c20] via-[#161c15] to-[#0c100b]">
        {activeImageUrl ? (
          <div className="relative h-full w-full">
            <Image
              src={activeImageUrl}
              alt={post.title}
              fill
              priority={isTop}
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-contain"
            />
            {/* GPU-accelerated Drag Highlight / Contrast-Fade Overlay */}
            {isTop && (
              <motion.div
                style={{ opacity: dragHighlightOpacity }}
                className="pointer-events-none absolute inset-0 z-10 bg-white"
              />
            )}
          </div>
        ) : (
          /* Fallback Placeholder when no image exists */
          <div className="flex h-full w-full flex-col items-center justify-center p-8 text-white/80">
            {isWish ? (
              <ElfIcon className="mb-4 h-24 w-24 text-[#CB5E32] opacity-80" />
            ) : (
              <WazowskiIcon className="mb-4 h-24 w-24 text-emerald-400 opacity-80" />
            )}
            <p className="font-ddin text-xl font-bold tracking-wide text-white/90">
              {post.title}
            </p>
            <p className="mt-1 font-ddin text-sm text-stone-300">
              {post.category_name_en || "Resource Post"}
            </p>
          </div>
        )}

        {/* Multi-Image Tap Navigation (Left/Right) */}
        {totalImages > 1 && isTop && (
          <div className="absolute inset-0 z-20 flex">
            <div
              onClick={handlePrevImage}
              className="group flex h-full w-1/2 cursor-pointer items-center justify-start pl-2"
            >
              {currentImageIndex > 0 && (
                <div className="rounded-full bg-black/50 p-1.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                  <ChevronLeft className="h-5 w-5" />
                </div>
              )}
            </div>
            <div
              onClick={handleNextImage}
              className="group flex h-full w-1/2 cursor-pointer items-center justify-end pr-2"
            >
              {currentImageIndex < totalImages - 1 && (
                <div className="rounded-full bg-black/50 p-1.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                  <ChevronRight className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Gradient Vignette */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/60 to-transparent" />

        {/* Top Badges */}
        <div className="absolute left-4 top-5 z-20 flex flex-wrap items-center gap-2">
          <Badge
            className={`flex items-center gap-1.5 px-3 py-1 font-ddin text-sm font-bold shadow-md ${
              isWish
                ? "border-orange-400/40 bg-orange-600/95 text-white"
                : "border-emerald-400/40 bg-emerald-700/95 text-white"
            }`}
          >
            {isWish ? (
              <>
                <ElfIcon className="h-3.5 w-3.5 text-[#C05421]" /> Wish
              </>
            ) : (
              <>
                <ReuseIcon className="h-3.5 w-3.5 text-[#FABE50]" /> Share
              </>
            )}
          </Badge>

          {post.category_name_en && (
            <Badge
              variant="secondary"
              className="border-white/10 bg-black/60 px-2.5 py-1 font-ddin text-xs font-semibold text-white shadow-sm"
            >
              {post.category_name_en}
            </Badge>
          )}

          {post.condition_name && (
            <Badge
              variant="outline"
              className="border-white/20 bg-black/50 px-2.5 py-1 font-ddin text-xs text-stone-200 shadow-sm"
            >
              {post.condition_name}
            </Badge>
          )}

          {isExpired && (
            <Badge className="border-red-400/30 bg-red-600/90 text-xs font-bold text-white shadow-sm">
              已過期
            </Badge>
          )}
        </div>

        {/* Top-Right Info Button */}
        {isTop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDetailClick(post);
            }}
            className="absolute right-4 top-5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/90 shadow-md transition-transform hover:scale-110 active:scale-95"
            aria-label="查看詳情"
          >
            <Info className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}

        {/* Bottom Content & Metadata Card Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/80 to-transparent pb-4 pl-4 pr-4 pt-16 font-ddin text-white">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-1 font-ddin text-2xl font-black tracking-tight text-white drop-shadow-sm">
              {post.title}
            </h2>
          </div>

          {post.content && (
            <p className="mt-1 line-clamp-2 font-ddin text-sm font-medium text-stone-200">
              {post.content}
            </p>
          )}

          {post.items && post.items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.items.slice(0, 3).map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium text-stone-100"
                >
                  <Package className="h-3 w-3 text-emerald-300" />
                  {item.quantity}x {item.title}
                </span>
              ))}
              {post.items.length > 3 && (
                <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-xs text-stone-300">
                  +{post.items.length - 3} more
                </span>
              )}
            </div>
          )}

          {post.tags && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {post.tags
                .split(",")
                .slice(0, 4)
                .map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-900/70 px-2.5 py-0.5 text-xs font-medium text-emerald-200"
                  >
                    <TagIcon className="h-3 w-3 text-emerald-400" />
                    {tag.trim()}
                  </span>
                ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5 text-xs text-stone-300">
            {(post.location_name ||
              post.city ||
              post.province ||
              post.full_address ||
              distanceStr) && (
              <div className="flex max-w-[58%] items-center gap-1.5 truncate">
                <LocationIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">
                  {post.location_name ||
                    [post.province, post.city].filter(Boolean).join(" ") ||
                    post.full_address}
                </span>
                {distanceStr && (
                  <span className="shrink-0 font-semibold text-emerald-300">
                    {post.location_name ||
                    post.city ||
                    post.province ||
                    post.full_address
                      ? `• ${distanceStr}`
                      : distanceStr}
                  </span>
                )}
              </div>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Avatar className="h-5 w-5 border border-white/20">
                <AvatarImage src={post.avatar_url} alt={post.username} />
                <AvatarFallback className="bg-stone-700 text-[10px] text-white">
                  {post.username?.slice(0, 1).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold text-white/90">
                {post.username}
              </span>
              {post.created_at && (
                <div className="flex items-center gap-1 text-stone-400">
                  <span>•</span>
                  <span>
                    {new Date(post.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
