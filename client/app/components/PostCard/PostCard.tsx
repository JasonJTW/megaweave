// PostCard.tsx 重點改寫
"use client";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";
import type { Category, Condition, Post } from "../../types/schema";
import ClockIcon from "../icons/ClockIcon";
import EyesIcon from "../icons/EyesIcon";
import LocationIcon from "../icons/LocationIcon";
import SeekBadgeExpiredIcon from "../icons/SeekBadgeExpiredIcon";
import ShareBadgeExpiredIcon from "../icons/ShareBadgeExpiredIcon";
import ShareBadgeIcon from "../icons/ShareBadgeIcon";
import SeekBadgeIcon from "../icons/WishBadgeIcon";

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
  isFirstVisible?: boolean;
  onCategoryClick?: (categoryId: number) => void;
  onLocationClick?: (
    type: "province" | "city" | "route",
    value: string,
  ) => void;
}

function PostCardInner({
  post,
  // conditions,
  categories,
  onPostClick,
  isExpanded = false,
  isFirstVisible,
  onCategoryClick,
  onLocationClick,
}: PostCardProps) {
  // const condition = conditions.find((c) => c.level === post.condition_level);

  const category = categories.find((c) => c.id === post.category_id);

  const imageUrls = Array.isArray(post.image_urls)
    ? post.image_urls
    : typeof post.image_urls === "string"
      ? post.image_urls.split(",")
      : [];

  const imageSrc = imageUrls[0];

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onClick={() => onPostClick(post)}
      className={`cursor-pointer rounded-[30px] font-ddin ${isExpired ? "bg-secondary" : "bg-white"} relative mt-4 py-0 pb-4 transition-all duration-300 ${
        isExpanded ? "postcard-expanded" : "postcard-collapsed"
      }`}
      style={
        {
          "--post-title-h": "12px",
        } as React.CSSProperties & Record<string, string>
      }
    >
      {/*//* pt-3 for title margin */}
      <div className="relative min-h-[414px] pt-3">
        {post.type === "share" &&
          (isExpired ? (
            <ShareBadgeExpiredIcon className="absolute -top-1 right-5 z-20" />
          ) : (
            <ShareBadgeIcon className="absolute -top-1 right-5 z-20" />
          ))}
        {post.type === "wish" &&
          (isExpired ? (
            <SeekBadgeExpiredIcon className="absolute -top-1 right-5 z-20" />
          ) : (
            <SeekBadgeIcon className="absolute -top-1 right-5 z-20" />
          ))}

        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={
            isExpanded ? { y: 0, maxHeight: 5000 } : { y: 0, maxHeight: 0 }
          }
          transition={{ duration: 0.6, ease: "easeIn" }}
          style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        >
          {imageSrc && (
            //* mx-3 for image margin
            <div className="relative mx-4 mb-0">
              {/* Mobile: w-full + auto height; Desktop: fill column width (max 280px) + fixed 240px height */}
              <div className="relative w-full overflow-hidden rounded-[20px] sm:mx-auto sm:h-[240px] sm:max-w-[280px]">
                {/* Mobile: responsive width/height */}
                <Image
                  src={imageSrc}
                  alt={post.title}
                  width={0}
                  height={0}
                  sizes="(min-width: 768px) 280px, 100vw"
                  className={`h-auto w-full object-cover sm:absolute sm:inset-0 sm:!h-full sm:!w-full ${isExpired && "opacity-70 brightness-105 contrast-50"}`}
                  priority={!!isFirstVisible}
                />
                {isExpired && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="font-ddin text-[28px] font-bold tracking-[0.12em] text-white sm:text-[32px]">
                      OVERDUE
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 flex w-full flex-row justify-between px-3 py-3">
                {post.view_count > 0 && (
                  <div className="flex items-center">
                    <Badge className="bg-[#7c7c7c] px-2 font-ddin text-[14px] font-normal text-white">
                      <EyesIcon className="mr-[4px]" />
                      {post.view_count}
                    </Badge>
                  </div>
                )}
                {/* {condition && (
                  <div className="flex items-center">
                    <Badge>{condition.name}</Badge>
                  </div>
                )} */}
              </div>
            </div>
          )}
          <h2 className="mx-4 flex-1 truncate font-ddin text-[36px] font-semibold text-gray-800">
            {post.title}
          </h2>

          {(category || post.category_name_en) && (
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
          )}

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
              {(post.province ||
                post.city ||
                post.route ||
                post.full_address) && (
                <div className="flex w-full items-start gap-2 sm:items-center">
                  <LocationIcon className="mt-[2px] flex-shrink-0 text-primary sm:mt-0" />
                  <div className="w-full min-w-0 flex-1 truncate text-[16px] text-gray-700">
                    {post.province && (
                      <span
                        className="cursor-pointer transition-colors hover:text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("province", post.province!);
                        }}
                      >
                        {post.province}
                      </span>
                    )}
                    {post.province && (post.city || post.route) && ", "}
                    {post.city && (
                      <span
                        className="cursor-pointer transition-colors hover:text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("city", post.city!);
                        }}
                      >
                        {post.city}
                      </span>
                    )}
                    {post.city && post.route && ", "}
                    {post.route && (
                      <span
                        className="cursor-pointer transition-colors hover:text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("route", post.route!);
                        }}
                      >
                        {post.route}
                      </span>
                    )}
                    {!post.province &&
                      !post.city &&
                      !post.route &&
                      post.full_address && <span>{post.full_address}</span>}
                  </div>
                </div>
              )}
              {post.expires_at && (
                <div className="flex items-center gap-2">
                  <ClockIcon className="text-primary" />
                  {new Date(post.expires_at).toLocaleDateString()}
                </div>
              )}
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
