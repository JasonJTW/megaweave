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
  isExpanded?: boolean; // 由父元件傳入
  index?: number;
}

export default function PostCard({
  post,
  conditions,
  onPostClick,
  isExpanded = false,
}: PostCardProps) {
  const condition = conditions.find((c) => c.level === post.condition_level);

  return (
    <motion.div
      layout
      onClick={() => onPostClick(post)}
      className={`cursor-pointer rounded-xl border border-gray-200 bg-megaweave-blue-light overflow-hidden transition-all duration-300 my-0 py-0`}
      style={{
        // 當展開時限制最大高度為：視窗高度 - title 高度
        maxHeight: isExpanded
          ? "calc(100vh - var(--post-title-h, 72px))"
          : "var(--post-title-h, 72px)",
      }}
      initial={{ scale: 0.99, opacity: 0.95 }}
      animate={{
        scale: isExpanded ? 1 : 0.995,
        opacity: 1,
      }}
      transition={{
        type: "spring",
        stiffness: 80,
        damping: 20,
      }}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 bg-megaweave-stone/10 backdrop-blur-sm`}
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

      <motion.div
        className="overflow-hidden"
        animate={{
          maxHeight: isExpanded ? "calc(100vh - var(--post-title-h, 72px))" : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
        style={{ overflow: "hidden" }}
      >
        {post.image_urls && post.image_urls.length > 0 && (
          <div className="relative w-full h-64 md:h-80 overflow-hidden">
            <Image
              src={post.image_urls.split(",")[0]}
              alt={post.title}
              fill
              className="object-cover rounded-lg"
              sizes="(max-width: 768px) 100vw, 50vw"
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
    </motion.div>
  );
}
