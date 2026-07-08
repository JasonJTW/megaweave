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
      className={`font-ddin cursor-pointer rounded-[30px] ${isExpired ? "bg-secondary" : "bg-white"} transition-all duration-300 py-0 pb-4 mt-4 relative ${
        isExpanded ? "postcard-expanded" : "postcard-collapsed"
      }`}
      style={
        {
          "--post-title-h": "12px",
        } as React.CSSProperties & Record<string, string>
      }
    >
      {/*//* pt-3 for title margin */}
      <div className="relative pt-3 min-h-[414px]">
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
            <div className=" relative mb-0 mx-4">
              {/* Mobile: w-full + auto height; Desktop: fill column width (max 280px) + fixed 240px height */}
              <div className="relative w-full sm:max-w-[280px] sm:h-[240px] sm:mx-auto rounded-[20px] overflow-hidden">
                {/* Mobile: responsive width/height */}
                <Image
                  src={imageSrc}
                  alt={post.title}
                  width={0}
                  height={0}
                  sizes="(min-width: 768px) 280px, 100vw"
                  className="w-full h-auto sm:!h-full sm:!w-full sm:absolute sm:inset-0 object-cover"
                  priority={!!isFirstVisible}
                />
                {isExpired && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50"
                    aria-hidden="true"
                  >
                    <span className="font-ddin text-[28px] font-bold tracking-[0.12em] text-white sm:text-[32px]">
                      OVERDUE
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute w-full flex flex-row bottom-0 justify-between px-3 py-3">
                {post.view_count > 0 && (
                  <div className="flex items-center">
                    <Badge className="bg-[#7c7c7c] text-white font-ddin font-normal text-[14px] px-2">
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
          <h2 className="font-semibold mx-4 font-ddin text-[36px] text-gray-800 truncate flex-1">
            {post.title}
          </h2>

          {(category || post.category_name_en) && (
            <div
              className="inline-flex mx-4 mt-[8px] leading-[34px] cursor-pointer"
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

          <div className="bg-transparent flex flex-col px-4 pb-3 mx-0 rounded-[20px]">
            <p className="text-black text-[18px] truncate sm:hidden">
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

            <div className="flex flex-col gap-[6px] mt-[12px] text-[16px] font-medium leading-[18px]">
              {(post.province ||
                post.city ||
                post.route ||
                post.full_address) && (
                <div className="flex items-start sm:items-center gap-2 w-full">
                  <LocationIcon className="text-primary flex-shrink-0 mt-[2px] sm:mt-0" />
                  <div className="text-[16px] text-gray-700 truncate min-w-0 flex-1 w-full">
                    {post.province && (
                      <span
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
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
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
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
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
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
