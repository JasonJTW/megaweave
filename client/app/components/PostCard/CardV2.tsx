import React from "react";
import { Post, Condition, Category } from "@/app/types/schema";
import { Calendar, User as UserIcon } from "lucide-react";
import Image from "next/image";
import { motion, useScroll } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import TagIcon from "../icons/TagIcon";
import LocationIcon from "../icons/LocationIcon";
import ClockIcon from "../icons/ClockIcon";

interface PostCardProps {
  key: number;
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
}

const CardV2 = ({
  post,
  conditions,
  onPostClick,
  categories,
}: PostCardProps) => {
  const condition = conditions.find((c) => c.level === post.condition_level);

  const category = categories.find((c) => c.id === post.category_id);

  return (
    // Card Container
    <div
      className="flex items-center justify-center h-screen sticky top-0 font-ddin font-medium"
      onClick={() => onPostClick(post)}
    >
      {/* Card */}
      <div className="w-full mx-7 cursor-pointer rounded-[30px] bg-megaweave-blue-light overflow-hidden transition-all duration-300 py-0 relative -top-[10%] flex flex-col pb-[17px]">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold font-ddin text-[36px] text-gray-800 truncate">
            {post.title}
          </h2>
          <div className="hidden md:flex items-center text-gray-500 text-sm">
            <UserIcon className="w-4 h-4 mr-1" />
            {post.username}
          </div>
        </div>

        {post.image_urls && post.image_urls.length > 0 && (
          // imageContainer
          <div className="w-full flex justify-center mb-0">
            <div className="relative w-full h-64 md:h-80 rounded-[20px] overflow-hidden mx-4">
              {/* inner */}
              <Image
                src={post.image_urls.split(",")[0]}
                alt={post.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                // lazy load 非首張
                priority={false}
              />

              {/* tags */}

              <div className="absolute flex flex-row gap-[6px] bottom-0 right-0 m-3">
                {/* Category tag */}
                {category && (
                  <div className="flex items-center">
                    <Badge>{category.name_en}</Badge>
                  </div>
                )}
                {/* Condition tag */}
                {condition && (
                  <div className=" flex items-center">
                    <Badge>{condition.name}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white flex flex-col p-4 mx-4 mt-[14px]  rounded-[20px]">
          <p className="text-black text-[18px] mb-[10px] truncate">
            {post.content}
          </p>
          {post.tags && (
            <div className="flex flex-wrap gap-2 leading-[18px]">
              {post.tags.split(",").map((tag, i) => (
                <div key={i} className="flex items-center">
                  <TagIcon className="text-primary" />
                  <span
                    key={i}
                    className="text-[16px]  text-megaweave-forest-dark px-2 "
                  >
                    {tag.trim()}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-[6px] mt-[6px]">
            {post.location && (
              <div className="flex items-center gap-2 text-[16px] leading-[18px]">
                <LocationIcon className="text-primary" />
                {post.location}
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
      </div>
    </div>
  );
};

export default CardV2;
