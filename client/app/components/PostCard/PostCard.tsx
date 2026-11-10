// PostCard.tsx 重點改寫
"use client";
import { Badge } from "@/components/ui/badge";
import { useImageWithRetry } from "@/hooks/useImageWithRetry";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import {
  getPostDistance,
  buildLocationDisplayParts,
} from "@/utils/locationUtils";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";
import React from "react";
import { useLocation } from "../../contexts/LocationContext";
import type {
  Category,
  Condition,
  Post,
  PostLocationField,
} from "../../types/schema";
import ClockIcon from "../icons/ClockIcon";
import EyesIcon from "../icons/EyesIcon";
import LocationIcon from "../icons/LocationIcon";
import SeekBadgeExpiredIcon from "../icons/SeekBadgeExpiredIcon";
import ShareBadgeExpiredIcon from "../icons/ShareBadgeExpiredIcon";
import ShareBadgeIcon from "../icons/ShareBadgeIcon";
import SeekBadgeIcon from "../icons/WishBadgeIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDisplayName } from "@/hooks/useDisplayName";

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
  isFirstVisible?: boolean;
  badgeContainerId?: string;
  onCategoryClick?: (categoryId: number) => void;
  onLocationClick?: (type: PostLocationField, value: string) => void;
}

function PostCardInner({
  post,
  // conditions,
  // categories,
  onPostClick,
  isExpanded = false,
  isFirstVisible,
  badgeContainerId,
  // onCategoryClick,
  onLocationClick,
}: PostCardProps) {
  // const condition = conditions.find((c) => c.level === post.condition_level);

  // const category = categories.find((c) => c.id === post.category_id);

  const s3Keys = parseS3Keys(post);

  const primarySrc = s3Keys[0]?.startsWith("http")
    ? s3Keys[0]
    : getImageUrl(s3Keys[0], "medium");

  const fallbackSrc = s3Keys[0]?.startsWith("http")
    ? s3Keys[0]
    : getImageUrl(s3Keys[0], "original");

  const {
    src: imageSrc,
    status: imageStatus,
    onError: handleImageError,
    onLoad: handleImageLoad,
  } = useImageWithRetry(primarySrc, fallbackSrc);

  const t = useTranslations("PostCard");
  const displayName = useDisplayName();
  const posterName = displayName(post.username);
  const { coords } = useLocation();
  const distanceStr = getPostDistance(coords, post.lat, post.lng);

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onClick={() => onPostClick(post)}
      className={`cursor-pointer rounded-[30px] font-ddin ${isExpired ? "bg-secondary" : "bg-white"} relative py-0 pb-1 transition-all duration-300 ${
        isExpanded ? "postcard-expanded" : "postcard-collapsed"
      }`}
      style={
        {
          "--post-title-h": "12px",
        } as React.CSSProperties & Record<string, string>
      }
    >
      {/*//* pt-3 for title margin */}
      <div className="relative min-h-[280px] pt-3">
        {/* Type badges aligned to the image column (outside overflow-hidden so ribbon isn't clipped) */}
        <div
          id={badgeContainerId}
          className="pointer-events-none absolute inset-x-4 top-3 z-20 sm:inset-x-auto sm:left-1/2 sm:w-[215px] sm:-translate-x-1/2"
        >
          {post.type === "share" &&
            (isExpired ? (
              <ShareBadgeExpiredIcon className="absolute right-[10px] top-0" />
            ) : (
              <ShareBadgeIcon className="absolute right-[10px] top-0" />
            ))}
          {post.type === "wish" &&
            (isExpired ? (
              <SeekBadgeExpiredIcon className="absolute right-[10px] top-0" />
            ) : (
              <SeekBadgeIcon className="absolute right-[10px] top-0" />
            ))}
        </div>

        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={
            isExpanded ? { y: 0, maxHeight: 5000 } : { y: 0, maxHeight: 0 }
          }
          transition={{ duration: 0.6, ease: "easeIn" }}
          style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        >
          {/* mx-3 for image margin */}
          <div className="relative mx-4 mb-2">
            {/* Mobile: w-full + auto height; Desktop: fill column width (max 215px) + fixed 184px height */}
            <div className="relative w-full overflow-hidden rounded-[20px] sm:mx-auto sm:h-[184px] sm:max-w-[215px]">
              {/* ── 無圖片或全部重試失敗：顯示純色底 + X 佔位符 ── */}
              {!imageSrc || imageStatus === "failed" ? (
                <div className="flex h-[184px] w-full items-center justify-center rounded-[20px] bg-primary-15"></div>
              ) : (
                <>
                  {/* ── 正在重試：shimmer skeleton overlay ── */}
                  {imageStatus === "retrying" && (
                    <div
                      className="absolute inset-0 z-10 animate-pulse rounded-[20px] bg-gradient-to-r from-primary-15 via-primary-30 to-primary-15 bg-[length:200%_100%]"
                      aria-hidden="true"
                      style={{
                        animation: "shimmer 1.4s ease-in-out infinite",
                      }}
                    />
                  )}

                  {/* Mobile: responsive width/height */}
                  <Image
                    src={imageSrc}
                    alt={post.title}
                    width={0}
                    height={0}
                    sizes="(min-width: 768px) 255px, 100vw"
                    className={`h-auto w-full object-cover sm:absolute sm:inset-0 sm:!h-full sm:!w-full ${isExpired && "opacity-70 brightness-105 contrast-50"}`}
                    priority={!!isFirstVisible}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                </>
              )}

              {isExpired && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="font-ddin text-[28px] font-bold tracking-[0.12em] text-white sm:text-[32px]">
                    {t("overdue")}
                  </span>
                </div>
              )}

              <div className="absolute bottom-0 left-0 flex w-full flex-row justify-between px-3 py-3">
                {/* 發文者名稱：組織物品是組織名義（#140） */}
                <Avatar
                  size="sm"
                  className="ring-[3px] ring-white"
                  title={posterName ?? undefined}
                  aria-label={posterName ?? undefined}
                >
                  <AvatarImage src={post.avatar_url} />
                  <AvatarFallback>
                    {posterName?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {post.view_count > 0 && (
                  <div className="flex items-center">
                    <Badge className="bg-[#7c7c7c] px-2 font-ddin text-[14px] font-normal text-white">
                      <EyesIcon className="mr-[4px]" />
                      {post.view_count}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
          <h2 className="mx-4 flex-1 truncate font-ddin text-[24px] font-semibold text-gray-800">
            {post.title}
          </h2>

          {/* {(category || post.category_name_en) && (
            <div
              className="mx-4 mt-[8px] inline-flex cursor-pointer leading-[34px]"
              onClick={(e) => {
                e.stopPropagation();
                if (onCategoryClick) {
                  onCategoryClick(post.category_id);
                }
              }}
            >
              <Badge className="h-[34px] transition-colors">
                {category?.name_en || post.category_name_en}
              </Badge>
            </div>
          )} */}

          <div className="mx-0 flex flex-col rounded-[20px] bg-transparent px-4 pb-3">
            <p className="truncate text-[18px] text-black sm:hidden">
              {post.content}
            </p>

            {/* <div className="min-h-[18px]">
              {post.tags && (
                <div className="flex flex-wrap gap-0 leading-[18px]">
                  {post.tags.split(",").map((tag, i) => (
                    <div
                      key={i}
                      className="flex items-center bg-secondary rounded-[10pt] px-[8px] py-[5px]"
                    >
                      <span className="text-[16px] text-megaweave-forest-dark px-2 font-medium font-ddin tracking-wider">
                        #{tag.trim()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div> */}

            <div className="mt-[12px] flex flex-col gap-[6px] text-[16px] font-medium leading-[18px]">
              <div className="min-h-[18px]">
                {(() => {
                  const parts = buildLocationDisplayParts(post);

                  if (parts.length === 0 && !post.full_address) return null;

                  return (
                    <div className="flex w-full items-start gap-2 sm:items-center">
                      <LocationIcon className="mt-[2px] flex-shrink-0 text-primary sm:mt-0" />
                      <div className="w-full min-w-0 flex-1 truncate text-[16px] text-gray-700">
                        {parts.length > 0
                          ? parts.map(({ field, value }, i) => (
                              <React.Fragment key={field}>
                                {i > 0 && ", "}
                                <span
                                  className="cursor-pointer transition-colors hover:text-primary hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLocationClick?.(field, value);
                                  }}
                                >
                                  {value}
                                </span>
                              </React.Fragment>
                            ))
                          : post.full_address && (
                              <span>{post.full_address}</span>
                            )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex w-full items-center justify-between">
                {post.expires_at && (
                  <div className="flex gap-2">
                    <ClockIcon className="text-primary" />
                    {new Date(post.created_at).toLocaleDateString()} -{" "}
                    {new Date(post.expires_at).toLocaleDateString()}
                  </div>
                )}
                {distanceStr && (
                  <div>
                    <span className="font-medium text-megaweave-blue">
                      {distanceStr}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default React.memo(PostCardInner, (prev, next) => {
  return (
    prev.isExpanded === next.isExpanded &&
    prev.post.id === next.post.id &&
    prev.isFirstVisible === next.isFirstVisible
  );
});
