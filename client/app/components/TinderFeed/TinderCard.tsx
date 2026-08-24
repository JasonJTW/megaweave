"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { getPostDistance } from "@/utils/locationUtils";
import { useLocation } from "../../contexts/LocationContext";
import type { Post } from "../../types/schema";
import LocationIcon from "../icons/LocationIcon";
import TagIcon from "../icons/TagIcon";
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
  onSwipe: (direction: "left" | "right") => void;
  onDetailClick: (post: Post) => void;
  forcedDirection?: "left" | "right" | null;
}

export default function TinderCard({
  post,
  isTop,
  indexInStack,
  onSwipe,
  onDetailClick,
  forcedDirection,
}: TinderCardProps) {
  const { coords } = useLocation();
  const distanceStr = getPostDistance(coords, post.lat, post.lng);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Key used to restart the CSS animation when the card changes or image resets
  const [progressKey, setProgressKey] = useState(0);
  // Track exit animation state for drag-triggered swipes
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);

  const s3Keys = parseS3Keys(post);
  const totalImages = s3Keys.length;

  // Pre-calculate image URLs (use optimized 'medium' webp thumbnails for blazing fast loading)
  const imageUrls = React.useMemo(() => {
    return s3Keys.map((key) => {
      if (!key) return "";
      return key.startsWith("http") ? key : getImageUrl(key, "medium");
    });
  }, [s3Keys]);

  // Motion values for drag & rotation
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-18, 18]);

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

  // currentImageIndex ref so the timer callback always gets the latest value
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
        // Still has more images → advance to next image
        setCurrentImageIndex((prev) => prev + 1);
        setProgressKey((k) => k + 1);
        // Restart timer for next image
        startAutoAdvance();
      }
      // Last image (or single-image card) → just stop, don't swipe
    }, AUTO_ADVANCE_SECS * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, clearAutoAdvance, s3Keys.length]);

  // Start timer when this card becomes top and reset progress bar animation
  useEffect(() => {
    if (isTop && !forcedDirection && !isDragging) {
      setProgressKey((k) => k + 1); // restart CSS animation
      startAutoAdvance();
    } else {
      clearAutoAdvance();
    }
    return clearAutoAdvance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, forcedDirection]);

  // Reset image index when the card becomes the top card
  useEffect(() => {
    if (isTop) setCurrentImageIndex(0);
  }, [isTop]);

  // Watch programmatic swipe triggered from action buttons
  useEffect(() => {
    if (isTop && forcedDirection) {
      clearAutoAdvance();
      // Don't set x directly — let animate handle the exit
    }
  }, [forcedDirection, isTop, clearAutoAdvance]);

  // When exitDir is set (drag-triggered), notify parent after animation
  useEffect(() => {
    if (!exitDir) return;
    const t = setTimeout(() => {
      onSwipe(exitDir);
    }, 350);
    return () => clearTimeout(t);
  }, [exitDir, onSwipe]);

  // Drag End handler
  // Rules:
  //  1. If the user releases near center (|offset.x| < SNAP_BACK_ZONE), ALWAYS snap back —
  //     regardless of how fast they flung it.
  //  2. Outside that safe zone, swipe triggers when offset is past SWIPE_THRESHOLD
  //     OR velocity is high and pointing in the same direction as the offset.
  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    setIsDragging(false);

    const SWIPE_THRESHOLD = 300; // px — must drag this far to commit
    const SNAP_BACK_ZONE = 160; // px — if released this close to center, always snap back
    const VELOCITY_THRESHOLD = 600; // px/s — fast fling, but only if offset agrees direction

    const offsetX = info.offset.x;
    const velocityX = info.velocity.x;

    // Guard: near center → always snap back, ignore velocity
    if (Math.abs(offsetX) < SNAP_BACK_ZONE) {
      // Resume timer since user dragged back to center
      startAutoAdvance();
      return;
    }

    // Helper: commit exit via drag (card flies off via animate prop, no snap-back)
    const commitExit = (dir: "left" | "right") => {
      clearAutoAdvance();
      setExitDir(dir);
    };

    // Offset-based: dragged far enough
    if (offsetX > SWIPE_THRESHOLD) {
      commitExit("right");
    } else if (offsetX < -SWIPE_THRESHOLD) {
      commitExit("left");
    }
    // Velocity-based: fast fling AND velocity direction matches offset direction
    else if (velocityX > VELOCITY_THRESHOLD && offsetX > 0) {
      commitExit("right");
    } else if (velocityX < -VELOCITY_THRESHOLD && offsetX < 0) {
      commitExit("left");
    } else {
      // Snap back → resume timer
      startAutoAdvance();
    }
  };

  // Switch image inside card (instantaneous because all images are pre-rendered)
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

  // Stack styling for cards underneath
  const scale = 1 - indexInStack * 0.04;
  const translateY = indexInStack * 10;
  const opacity = indexInStack > 2 ? 0 : 1 - indexInStack * 0.15;
  const zIndex = 30 - indexInStack;

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;

  const isWish = post.type === "wish";

  return (
    <motion.div
      style={{
        zIndex,
        ...(isTop ? { x, y, rotate } : { scale, y: translateY, opacity }),
      }}
      drag={isTop && !exitDir}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={isTop ? handleDragEnd : undefined}
      animate={(() => {
        // Drag-triggered exit: animate card flying off from its current dragged position
        if (isTop && exitDir) {
          return {
            x: exitDir === "right" ? 900 : -900,
            rotate: exitDir === "right" ? 25 : -25,
            opacity: 0,
            transition: { duration: 0.32, ease: [0.32, 0, 0.67, 0] as const },
          };
        }
        // Button-triggered exit: animate x off screen
        if (isTop && forcedDirection) {
          return {
            x: forcedDirection === "right" ? 900 : -900,
            rotate: forcedDirection === "right" ? 25 : -25,
            opacity: 0,
            transition: { duration: 0.38, ease: [0.32, 0, 0.67, 0] as const },
          };
        }
        // Normal resting state
        if (isTop) return { scale: 1, y: 0, opacity: 1 };
        return { scale, y: translateY, opacity };
      })()}
      transition={
        isTop && (forcedDirection || exitDir)
          ? { duration: 0.38 }
          : { type: "spring", stiffness: 280, damping: 26 }
      }
      className={`absolute inset-0 flex select-none flex-col justify-between overflow-hidden rounded-[28px] border border-stone-200/80 bg-[#1e231d] shadow-2xl ${
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      {/* ─── Story Style Progress Bars (top, always shown for top card) ─── */}
      {isTop && (
        <div className="absolute left-0 right-0 top-3 z-30 flex gap-1.5 px-4">
          {(totalImages > 1 ? imageUrls : [""]).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-black/40 backdrop-blur-sm"
            >
              {i < currentImageIndex ? (
                // Already passed — fully filled
                <div className="h-full w-full bg-white/80" />
              ) : i === currentImageIndex ? (
                // Active — animating fill via CSS keyframe
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
                // Future — empty
                <div className="h-full w-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Swipe Feedback Stamps (LIKE / NOPE) ─── */}
      {isTop && (
        <>
          {/* LIKE / 加分 Stamp */}
          <motion.div
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute left-6 top-8 z-40 -rotate-12 rounded-xl border-[4px] border-emerald-400 bg-emerald-950/70 px-4 py-1.5 text-center shadow-lg backdrop-blur-sm"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-emerald-400">
              LIKE +1
            </span>
          </motion.div>

          {/* NOPE / PASS Stamp */}
          <motion.div
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-6 top-8 z-40 rotate-12 rounded-xl border-[4px] border-rose-500 bg-rose-950/70 px-4 py-1.5 text-center shadow-lg backdrop-blur-sm"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-rose-500">
              PASS
            </span>
          </motion.div>
        </>
      )}

      {/* ─── Main Image & Tap Navigation Layer ─── */}
      <div className="relative h-full w-full flex-1 overflow-hidden bg-stone-900">
        {imageUrls.length > 0 ? (
          <>
            {/* Pre-render all images of the card with ambient blur background + object-contain foreground */}
            {imageUrls.map((url, i) => (
              <div
                key={i}
                className={`absolute inset-0 overflow-hidden transition-opacity duration-200 ${
                  i === currentImageIndex
                    ? "pointer-events-auto z-0 opacity-100"
                    : "pointer-events-none -z-10 opacity-0"
                }`}
              >
                {/* 1. Ambient Blurred Background Layer (Tinder/Instagram Style) */}
                <div className="absolute inset-0 overflow-hidden">
                  <Image
                    src={url}
                    alt=""
                    fill
                    priority={isTop && i === 0}
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="scale-125 object-cover opacity-80 blur-2xl brightness-50"
                  />
                  <div className="absolute inset-0 bg-black/25" />
                </div>

                {/* 2. Main Foreground Image (Preserves full aspect ratio without cropping) */}
                <div className="relative h-full w-full">
                  <Image
                    src={url}
                    alt={`${post.title} - ${i + 1}`}
                    fill
                    priority={isTop}
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="object-contain drop-shadow-2xl"
                  />
                </div>
              </div>
            ))}
          </>
        ) : (
          /* Fallback Placeholder when no image exists */
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2a3c26] to-[#141e12] p-8 text-white/80">
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

        {/* Multi-Image Tap Zones (Left/Right) */}
        {totalImages > 1 && isTop && (
          <div className="absolute inset-0 z-20 flex">
            <div
              onClick={handlePrevImage}
              className="group flex h-full w-1/2 cursor-pointer items-center justify-start pl-2"
            >
              {currentImageIndex > 0 && (
                <div className="rounded-full bg-black/40 p-1.5 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <ChevronLeft className="h-5 w-5" />
                </div>
              )}
            </div>
            <div
              onClick={handleNextImage}
              className="group flex h-full w-1/2 cursor-pointer items-center justify-end pr-2"
            >
              {currentImageIndex < totalImages - 1 && (
                <div className="rounded-full bg-black/40 p-1.5 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <ChevronRight className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Vignette Overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />

        {/* Top Badges */}
        <div className="absolute left-4 top-5 z-20 flex flex-wrap items-center gap-2">
          {/* Wish / Share Badge */}
          <Badge
            className={`flex items-center gap-1.5 px-3 py-1 font-ddin text-sm font-bold shadow-md backdrop-blur-md ${
              isWish
                ? "border-orange-400/40 bg-orange-600/90 text-white"
                : "border-emerald-400/40 bg-emerald-700/90 text-white"
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

          {/* Category Badge */}
          {post.category_name_en && (
            <Badge className="border-white/20 bg-black/50 px-2.5 py-1 font-ddin text-xs font-semibold text-white/90 backdrop-blur-md">
              {post.category_name_en}
            </Badge>
          )}

          {/* Condition Badge */}
          {post.condition_name && (
            <Badge className="border-white/20 bg-black/50 px-2.5 py-1 font-ddin text-xs font-medium text-stone-200 backdrop-blur-md">
              {post.condition_name}
            </Badge>
          )}

          {isExpired && (
            <Badge className="border-red-400/30 bg-red-600/90 px-2 py-0.5 font-ddin text-xs text-white">
              Expired
            </Badge>
          )}
        </div>

        {/* Bottom Gradient Overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-gradient-to-t from-[#151c14] via-[#151c14]/90 to-transparent" />

        {/* ─── Bottom Content Card Overlay ─── */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-5 font-ddin text-white">
          {/* Title & Info Button */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-2 text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-md">
              {post.title}
            </h2>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDetailClick(post);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-transform hover:scale-110 hover:bg-white/30 active:scale-95"
              aria-label="View Details"
            >
              <Info className="h-5 w-5" />
            </button>
          </div>

          {/* Content Excerpt */}
          {post.content && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-200/90 drop-shadow">
              {post.content}
            </p>
          )}

          {/* Items Preview (if any) */}
          {post.items && post.items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.items.slice(0, 3).map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium text-stone-100 backdrop-blur-sm"
                >
                  <Package className="h-3 w-3 text-emerald-300" />
                  {item.quantity}x {item.title}
                </span>
              ))}
              {post.items.length > 3 && (
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs text-stone-300">
                  +{post.items.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Tags */}
          {post.tags && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {post.tags
                .split(",")
                .slice(0, 4)
                .map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-900/60 px-2.5 py-0.5 text-xs font-medium text-emerald-200 backdrop-blur-sm"
                  >
                    <TagIcon className="h-3 w-3 text-emerald-400" />
                    {tag.trim()}
                  </span>
                ))}
            </div>
          )}

          {/* Metadata Footer (Location, Author, Date) */}
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-stone-300">
            {/* Location */}
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

            {/* Author & Date */}
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
