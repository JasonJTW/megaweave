"use client";

import type { Post } from "@/app/types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { Heart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import CommonShareIcon from "../icons/CommonShareIcon";
import ElfIcon from "../icons/ElfIcon";
import ReuseIcon from "../icons/ReuseIcon";

interface CompactPostCardProps {
  post: Post;
  isCurrent?: boolean;
  onClick?: () => void;
  className?: string;
  viewedAt?: string | null;
}

function getPostImageSrc(post: Post): string | null {
  const keys = parseS3Keys(post);
  if (!keys[0]) return null;
  return keys[0].startsWith("http") ? keys[0] : getImageUrl(keys[0], "thumb");
}

export default function CompactPostCard({
  post,
  isCurrent = false,
  onClick,
  className = "",
  viewedAt,
}: CompactPostCardProps) {
  const router = useRouter();

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;
  const imageSrc = getPostImageSrc(post);
  const tags = post.tags
    ? post.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push(`/item/${post.public_id}`);
    }
  };

  const renderTypeIcon = () => {
    if (post.type === "share") {
      return <ReuseIcon className="h-5 w-5 shrink-0 text-megaweave-gold" />;
    }
    if (post.type === "commons") {
      return (
        <CommonShareIcon className="h-5 w-5 shrink-0 text-megaweave-blue" />
      );
    }
    return <ElfIcon className="h-5 w-5 shrink-0 text-megaweave-red-dark" />;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex w-full gap-3 rounded-[20px] bg-white p-2.5 text-left shadow-sm transition-all hover:bg-white/90 hover:shadow-md ${
        isCurrent ? "ring-1 ring-primary/40" : ""
      } ${className}`}
    >
      {/* Thumbnail */}
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-secondary/40">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={post.title}
            fill
            className={`object-cover transition-transform duration-200 group-hover:scale-105 ${
              isExpired ? "opacity-70" : ""
            }`}
            sizes="72px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-400">
            {post.title ? post.title.charAt(0) : "?"}
          </div>
        )}
        {isExpired && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50"
            aria-hidden="true"
          >
            <span className="font-ddin text-[10px] font-bold tracking-[0.10em] text-white">
              OVERDUE
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <h3 className="truncate text-[16px] font-bold text-gray-900 group-hover:text-primary">
            {post.title}
          </h3>
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-gray-500"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[12px] text-megaweave-brown">
            <Heart className="h-3.5 w-3.5 fill-current" />
            {post.likes_count ?? 0}
          </span>
          <div className="flex items-center gap-2">
            {viewedAt && (
              <span className="text-[10px] text-gray-400">
                {new Date(viewedAt).toLocaleDateString()}
              </span>
            )}
            {renderTypeIcon()}
          </div>
        </div>
      </div>
    </button>
  );
}
