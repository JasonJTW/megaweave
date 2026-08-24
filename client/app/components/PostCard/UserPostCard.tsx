"use client";
import type { Weave } from "@/services/weaveService";
import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import type { Category, Condition, Post, PostLocationField } from "../../types/schema";
import SeekBadgeExpiredIcon from "../icons/SeekBadgeExpiredIcon";
import ShareBadgeExpiredIcon from "../icons/ShareBadgeExpiredIcon";
import ShareBadgeIcon from "../icons/ShareBadgeIcon";
import SeekBadgeIcon from "../icons/WishBadgeIcon";

interface UserPostCardProps {
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
  weave?: Weave;
  currentUserId?: number;
  isFirstVisible?: boolean;
  onCategoryClick?: (categoryId: number) => void;
  onLocationClick?: (type: PostLocationField, value: string) => void;
}

function UserPostCardInner({
  post,
  onPostClick,
  isFirstVisible,
}: UserPostCardProps) {
  const s3Keys = parseS3Keys(post);

  const primarySrc = s3Keys[0]?.startsWith("http")
    ? s3Keys[0]
    : getImageUrl(s3Keys[0], "thumb");

  const fallbackSrc = s3Keys[0]?.startsWith("http")
    ? s3Keys[0]
    : getImageUrl(s3Keys[0], "original");

  const [imageSrc, setImageSrc] = React.useState(primarySrc);

  React.useEffect(() => {
    setImageSrc(primarySrc);
  }, [primarySrc]);

  const isExpired = post.expires_at
    ? new Date(post.expires_at) < new Date()
    : false;

  const dateText = post.created_at
    ? new Date(post.created_at).toLocaleDateString()
    : "";
  const typeText =
    post.type === "share" ? "Share" : post.type === "wish" ? "Wish" : "Commons";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onClick={() => onPostClick(post)}
      className="group relative h-[161px] w-[145px] cursor-pointer rounded-[24px] bg-white font-ddin transition-all duration-300 hover:shadow-md"
    >
      {/* 圖片（常態顯示） */}
      <div className="relative h-full w-full bg-secondary/50">
        {imageSrc ? (
          <>
            <Image
              src={imageSrc}
              alt={post.title}
              fill
              sizes="145px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              priority={!!isFirstVisible}
              onError={() => {
                if (imageSrc !== fallbackSrc) {
                  setImageSrc(fallbackSrc);
                }
              }}
            />
            {post.status === "inactive" ? (
              <div
                className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/60"
                aria-hidden="true"
              >
                <span className="font-ddin text-[14px] font-bold tracking-[0.12em] text-white">
                  HIDDEN
                </span>
              </div>
            ) : isExpired ? (
              <div
                className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/50"
                aria-hidden="true"
              >
                <span className="font-ddin text-[14px] font-bold tracking-[0.12em] text-white">
                  OVERDUE
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="type-body-t5 flex h-full w-full items-center justify-center text-primary-75">
            No image
          </div>
        )}

        {/* 右上角標籤（常態顯示） */}
        {post.type === "share" &&
          (isExpired ? (
            <ShareBadgeExpiredIcon className="absolute right-3 top-[-4px] z-10 transition-opacity duration-200 group-hover:opacity-0" />
          ) : (
            <ShareBadgeIcon className="absolute right-3 top-[-4px] z-10 transition-opacity duration-200 group-hover:opacity-0" />
          ))}
        {post.type === "wish" &&
          (isExpired ? (
            <SeekBadgeExpiredIcon className="absolute right-3 top-[-4px] z-10 transition-opacity duration-200 group-hover:opacity-0" />
          ) : (
            <SeekBadgeIcon className="absolute right-3 top-[-4px] z-10 transition-opacity duration-200 group-hover:opacity-0" />
          ))}

        {/* hover 才顯示資訊 */}
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          <div className="relative flex h-full flex-col px-4 pb-3 pt-4">
            <div className="space-y-2">
              <div className="type-h5 line-clamp-1 font-semibold leading-[1.05] tracking-tight text-white drop-shadow-sm">
                {post.title}
              </div>
              <div className="text-[18px] font-semibold text-white/90 drop-shadow-sm">
                {dateText}
              </div>
            </div>
            <div className="text-body-t5 mt-auto inline-flex w-fit items-center rounded-full bg-white/80 px-4 py-2 text-megaweave-forest-dark backdrop-blur">
              {typeText}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default React.memo(UserPostCardInner, (prev, next) => {
  return (
    prev.isExpanded === next.isExpanded &&
    prev.post.id === next.post.id &&
    prev.weave?.status === next.weave?.status &&
    prev.weave?.giver_confirmed === next.weave?.giver_confirmed &&
    prev.weave?.receiver_confirmed === next.weave?.receiver_confirmed &&
    prev.isFirstVisible === next.isFirstVisible
  );
});
