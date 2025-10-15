// PostCard.tsx 重點改寫
"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { MapPin, Calendar, User as UserIcon, Tag } from "lucide-react";
import type { Post, Condition } from "../../types/schema";

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
}

function PostCardInner({
  post,
  conditions,
  onPostClick,
  isExpanded = false,
}: PostCardProps) {
  const condition = conditions.find((c) => c.level === post.condition_level);

  return (
    <div
      onClick={() => onPostClick(post)}
      className={`cursor-pointer rounded-xl border border-gray-200 bg-megaweave-blue-light overflow-hidden transition-all duration-300 py-0 ${
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
        className="flex items-center justify-between px-4 py-3 bg-megaweave-stone/10 backdrop-blur-sm"
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
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={
          isExpanded ? { y: 0, maxHeight: 2000 } : { y: -8, maxHeight: 0 }
        }
        transition={{ duration: 0.2, ease: "easeInOut" }}
        style={{ pointerEvents: isExpanded ? "auto" : "none" }}
      >
        {post.image_urls && post.image_urls.length > 0 && (
          <div className="relative w-full h-64 md:h-80 overflow-hidden">
            <Image
              src={post.image_urls.split(",")[0]}
              alt={post.title}
              fill
              className="object-cover rounded-lg"
              sizes="(max-width: 768px) 100vw, 50vw"
              // lazy load 非首張
              priority={false}
            />
          </div>
        )}

        <div className="p-4 space-y-3">
          <p className="text-gray-700 text-sm whitespace-pre-line">
            {post.content}
          </p>
          <div className="flex flex-wrap gap-3 pt-2 text-gray-600 text-sm">
            {post.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {post.location}
              </div>
            )}
            {post.created_at && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(post.created_at).toLocaleDateString()}
              </div>
            )}
            {condition && (
              <div className="flex items-center gap-1">
                <Tag className="w-4 h-4" />
                {condition.name}
              </div>
            )}
          </div>

          {post.tags && (
            <div className="flex flex-wrap gap-2 mt-2">
              {post.tags.split(",").map((tag, i) => (
                <span
                  key={i}
                  className="text-xs bg-primary-15 text-megaweave-forest-dark px-2 py-1 rounded-full"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
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
