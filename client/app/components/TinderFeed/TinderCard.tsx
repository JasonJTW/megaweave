"use client";

import React, { useState, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import type { Post } from "../../types/schema";
import LocationIcon from "../icons/LocationIcon";
import TagIcon from "../icons/TagIcon";
import ElfIcon from "../icons/ElfIcon";
import WazowskiIcon from "../icons/WazowskiIcon";
import { Info, Sparkles, ChevronLeft, ChevronRight, Package } from "lucide-react";

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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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

  // Watch programmatic swipe triggered from action buttons
  useEffect(() => {
    if (isTop && forcedDirection) {
      const exitX = forcedDirection === "right" ? 800 : -800;
      x.set(exitX);
    }
  }, [forcedDirection, isTop, x]);

  // Drag End handler
  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const threshold = 100;
    const velocityThreshold = 400;

    if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      onSwipe("right");
    } else if (
      info.offset.x < -threshold ||
      info.velocity.x < -velocityThreshold
    ) {
      onSwipe("left");
    }
  };

  // Switch image inside card (instantaneous because all images are pre-rendered)
  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentImageIndex > 0) {
      setCurrentImageIndex((prev) => prev - 1);
    }
  };

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentImageIndex < totalImages - 1) {
      setCurrentImageIndex((prev) => prev + 1);
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
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={isTop ? handleDragEnd : undefined}
      animate={
        isTop && forcedDirection
          ? {
              x: forcedDirection === "right" ? 800 : -800,
              rotate: forcedDirection === "right" ? 25 : -25,
              opacity: 0,
              transition: { duration: 0.35, ease: "easeInOut" },
            }
          : isTop
            ? { scale: 1, y: 0, opacity: 1 }
            : { scale, y: translateY, opacity }
      }
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[28px] border border-stone-200/80 bg-[#1e231d] shadow-2xl select-none ${
        isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      }`}
    >
      {/* ─── Story Style Progress Bars (for multiple images) ─── */}
      {totalImages > 1 && (
        <div className="absolute left-0 right-0 top-3 z-30 flex gap-1.5 px-4">
          {imageUrls.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full bg-black/40 backdrop-blur-sm"
            >
              <div
                className={`h-full transition-all duration-200 ${
                  i === currentImageIndex
                    ? "bg-white"
                    : i < currentImageIndex
                      ? "bg-white/80"
                      : "bg-transparent"
                }`}
              />
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
            className="pointer-events-none absolute left-6 top-8 z-40 rounded-xl border-[4px] border-emerald-400 bg-emerald-950/70 px-4 py-1.5 text-center shadow-lg backdrop-blur-sm -rotate-12"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-emerald-400">
              LIKE +1
            </span>
          </motion.div>

          {/* NOPE / PASS Stamp */}
          <motion.div
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-6 top-8 z-40 rounded-xl border-[4px] border-rose-500 bg-rose-950/70 px-4 py-1.5 text-center shadow-lg backdrop-blur-sm rotate-12"
          >
            <span className="font-ddin text-2xl font-black tracking-wider text-rose-500">
              PASS
            </span>
          </motion.div>
        </>
      )}

      {/* ─── Main Image & Tap Navigation Layer ─── */}
      <div className="relative h-full w-full flex-1 bg-stone-900 overflow-hidden">
        {imageUrls.length > 0 ? (
          <>
            {/* Pre-render all images of the card so switching between images is instantaneous */}
            {imageUrls.map((url, i) => (
              <div
                key={i}
                className={`absolute inset-0 transition-opacity duration-200 ${
                  i === currentImageIndex
                    ? "opacity-100 z-0 pointer-events-auto"
                    : "opacity-0 -z-10 pointer-events-none"
                }`}
              >
                <Image
                  src={url}
                  alt={`${post.title} - ${i + 1}`}
                  fill
                  priority={isTop}
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-cover"
                />
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
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent z-10" />

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
                <Sparkles className="h-3.5 w-3.5" /> Wish
              </>
            ) : (
              <>
                <Package className="h-3.5 w-3.5" /> Share
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#151c14] via-[#151c14]/90 to-transparent z-10" />

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
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2.5 py-0.5 text-xs font-medium text-emerald-200 backdrop-blur-sm border border-emerald-500/20"
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
              post.full_address) && (
              <div className="flex items-center gap-1.5 truncate max-w-[55%]">
                <LocationIcon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">
                  {post.location_name ||
                    [post.province, post.city].filter(Boolean).join(" ") ||
                    post.full_address}
                </span>
              </div>
            )}

            {/* Author & Date */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
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
