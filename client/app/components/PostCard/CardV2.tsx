"use client";
import React, { useRef } from "react";
import { Post, Condition, Category } from "@/app/types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { User as UserIcon } from "lucide-react";
import Image from "next/image";
import { motion, MotionValue, useTransform } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import TagIcon from "../icons/TagIcon";
import LocationIcon from "../icons/LocationIcon";
import ClockIcon from "../icons/ClockIcon";

interface PostCardProps {
  key: number;
  i: number;
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  progress: MotionValue;
  range: number[];
  targetScale: number;
}

const CardV2 = ({
  i,
  post,
  onPostClick,
  categories,
  progress,
  range,
  targetScale,
}: PostCardProps) => {
  const container = useRef(null);

  const scale = useTransform(progress, range, [1, targetScale]);

  const category = categories.find((c) => c.id === post.category_id);

  const s3Keys = parseS3Keys(post);

  const firstKey = s3Keys[0];
  const imageSrc = firstKey
    ? firstKey.startsWith("http")
      ? firstKey
      : getImageUrl(firstKey, "medium")
    : null;

  return (
    // Card Container
    <div
      ref={container}
      className="sticky top-0 flex h-screen items-center justify-center font-ddin font-medium"
      onClick={() => onPostClick(post)}
    >
      {/* Card */}
      <motion.div
        className="relative mx-7 flex w-full cursor-pointer flex-col overflow-hidden rounded-[30px] border border-red-300 bg-megaweave-blue-light py-0 pb-[17px] transition-all duration-300"
        style={{ scale, top: `calc(-10% + ${i * 68}px)` }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="truncate font-ddin text-[36px] font-semibold text-gray-800">
            {post.title}
          </h2>
          <div className="hidden items-center text-sm text-gray-500 md:flex">
            <UserIcon className="mr-1 h-4 w-4" />
            {post.username}
          </div>
        </div>

        {imageSrc && (
          // imageContainer
          <div className="mx-4 mb-0 flex justify-center overflow-hidden rounded-[20px]">
            {/* inner */}
            <div className="relative h-64 w-full md:h-80">
              <motion.div className="relative h-64 w-full md:h-80">
                <Image
                  src={imageSrc}
                  alt={post.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  // lazy load 非首張
                  priority={false}
                />
              </motion.div>

              {/* tags */}

              <div className="absolute bottom-0 right-0 m-3 flex flex-row gap-[6px]">
                {/* Category tag */}
                {category && (
                  <div className="flex items-center">
                    <Badge>{category.name_en}</Badge>
                  </div>
                )}
                {/* Condition tag */}
                {post.condition_name && (
                  <div className="flex items-center">
                    <Badge>{post.condition_name}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mx-4 mt-[14px] flex flex-col rounded-[20px] bg-white p-4">
          <p className="mb-[10px] truncate text-[18px] text-black">
            {post.content}
          </p>
          <div className="min-h-[18px]">
            {post.tags && (
              <div className="flex flex-wrap gap-2 leading-[18px]">
                {post.tags.split(",").map((tag, i) => (
                  <div key={i} className="flex items-center">
                    <TagIcon className="text-primary" />
                    <span
                      key={i}
                      className="px-2 text-[16px] text-megaweave-forest-dark"
                    >
                      {tag.trim()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-[6px] flex flex-col gap-[6px]">
            {(post.location_name ||
              post.province ||
              post.city ||
              post.route ||
              post.full_address) && (
              <div className="flex items-center gap-2 text-[16px] leading-[18px]">
                <LocationIcon className="text-primary" />
                {post.location_name ||
                  [post.province, post.city, post.route]
                    .filter(Boolean)
                    .join("") ||
                  post.full_address}
              </div>
            )}
            {post.created_at && (
              <div className="flex items-center gap-2 text-[16px] leading-[18px]">
                <ClockIcon className="text-primary" />
                {new Date(post.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CardV2;
