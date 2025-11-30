// PostCard.tsx 重點改寫
"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { User as UserIcon } from "lucide-react";
import type { Post, Condition, Category } from "../../types/schema";
import { Badge } from "@/components/ui/badge";
// import TagIcon from "../icons/TagIcon";
import LocationIcon from "../icons/LocationIcon";
import ClockIcon from "../icons/ClockIcon";
import EyesIcon from "../icons/EyesIcon";
import BadgeIcon from "../icons/BadgeIcon";

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
}

function PostCardInner({
  post,
  conditions,
  categories,
  onPostClick,
  isExpanded = false,
}: PostCardProps) {
  const condition = conditions.find((c) => c.level === post.condition_level);

  const category = categories.find((c) => c.id === post.category_id);

  return (
    <div
      onClick={() => onPostClick(post)}
      className={`font-ddin cursor-pointer rounded-[30px]  bg-white overflow-hidden transition-all duration-300 py-0 pb-4 relevant ${
        isExpanded ? "postcard-expanded" : "postcard-collapsed"
      }`}
      style={
        {
          // 固定 title 高度，展開內容用 transform/opacity 顯示，避免 maxHeight reflow
          // 如果需要讓 expanded content 覆蓋視窗，可考慮在這裡使用 position: sticky / absolute
          "--post-title-h": "72px",
        } as React.CSSProperties & Record<string, string>
      }
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          height: "var(--post-title-h, 72px)",
          minHeight: "var(--post-title-h, 72px)",
        }}
      >
        <h2 className="font-semibold font-ddin text-[36px] text-gray-800 truncate">
          {post.title}
        </h2>
        <div className="hidden md:flex items-center text-gray-500 text-sm">
          <UserIcon className="w-4 h-4 mr-1" />
          {post.username}
        </div>
      </div>

      {/* 這塊改成用 transform/opacity 做顯示，避免變更 layout 高度 */}
      <div className="relative">
        {post.type === "share" && (
          <BadgeIcon className="absolute -top-1 right-5 z-20" />
        )}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={
            isExpanded ? { y: 0, maxHeight: 2000 } : { y: 0, maxHeight: 0 }
          }
          transition={{ duration: 0.6, ease: "easeIn" }}
          style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        >
          {post.image_urls && post.image_urls.length > 0 && (
            <div className="relative justify-center mb-0  mx-4">
              <div className="relative w-full h-64 md:h-80 rounded-[20px] overflow-hidden ">
                <Image
                  src={post.image_urls.split(",")[0]}
                  alt={post.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  // lazy load 非首張
                  priority={false}
                />
              </div>
              {/* tags */}
              <div className="absolute w-full flex flex-row bottom-0 justify-between px-5 py-5">
                {/* Condition tag */}
                {post.view_count > 0 && (
                  <div className=" flex items-center">
                    <Badge className="bg-[#7c7c7c] text-white font-ddin font-normal text-[14px] px-2">
                      <EyesIcon className="mr-[4px] " />
                      {post.view_count}
                    </Badge>
                  </div>
                )}
                {condition && (
                  <div className=" flex items-center">
                    <Badge>{condition.name}</Badge>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Category tag */}
          {category && (
            <div className="flex items-center mx-4 mt-[14px] leading-[34px]">
              <Badge className="h-[34px]">{category.name_en}</Badge>
            </div>
          )}
          <div className="bg-white flex flex-col p-4 mx-4 mt-[14px]  rounded-[20px]">
            <p className="text-black text-[18px] mb-[10px] truncate">
              {post.content}
            </p>
            <div className="min-h-[18px]">
              {post.tags && (
                <div className="flex flex-wrap gap-0 leading-[18px]">
                  {post.tags.split(",").map((tag, i) => (
                    <div
                      key={i}
                      className="flex items-center bg-secondary rounded-[10pt] px-[8px] py-[5px]"
                    >
                      {/* <TagIcon className="text-primary" /> */}
                      <span
                        key={i}
                        className="text-[16px]  text-megaweave-forest-dark px-2 font-medium font-ddin tracking-wider"
                      >
                        #{tag.trim()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-[6px] mt-[12px] text-[16px] font-medium leading-[18px]">
              {post.location && (
                <div className="flex items-center gap-2  ">
                  <LocationIcon className="text-primary" />
                  {post.location}
                </div>
              )}
              {post.created_at && (
                <div className="flex items-center gap-2  ">
                  <ClockIcon className="text-primary" />
                  {new Date(post.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// memoize 以避免不必要 rerender
export default React.memo(PostCardInner, (prev, next) => {
  // 只有在 isExpanded 或 post.id 或 post.content 變化時才 rerender
  return (
    prev.isExpanded === next.isExpanded &&
    prev.post.id === next.post.id &&
    prev.post.content === next.post.content
  );
});
