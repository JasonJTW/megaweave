"use client";

import EyesIcon from "@/app/components/icons/EyesIcon";
import LocationIcon from "@/app/components/icons/LocationIcon";
import type { Condition, Post } from "@/app/types/schema";
import { Badge } from "@/components/ui/badge";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";

const SHARE_HEADER_SRC = {
  share: "/assets/PostShareShare.svg",
  wish: "/assets/PostShareWish.svg",
  commons: "/assets/PostShareWeaving.svg",
} as const;

interface PostShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
  condition?: Condition;
  onInstagramShare: () => void;
}

const PostShareModal = ({
  open,
  onOpenChange,
  post,
  condition,
  onInstagramShare,
}: PostShareModalProps) => {
  const imageUrls = post.image_urls
    ? post.image_urls.split(",").filter(Boolean)
    : [];
  const thumbnailUrls = post.thumbnail_urls
    ? post.thumbnail_urls.split(",").filter(Boolean)
    : [];
  const imageSrc = thumbnailUrls[0] || imageUrls[0];
  const headerSrc = SHARE_HEADER_SRC[post.type] ?? SHARE_HEADER_SRC.share;

  const locationText =
    [post.province, post.city, post.route].filter(Boolean).join("") ||
    post.full_address ||
    "";

  const tags = post.tags
    ? post.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const handleInstagramShare = () => {
    onInstagramShare();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60" />
        <Dialog.Content
          className="fixed inset-0 z-[201] flex items-center justify-center p-4 focus:outline-none"
          onClick={() => onOpenChange(false)}
        >
          <div
            className="flex w-full max-w-[360px] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Dialog.Title className="sr-only">Share post</Dialog.Title>
            <Dialog.Description className="sr-only">
              Preview and share this post to Instagram
            </Dialog.Description>

            <div className="w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headerSrc} alt="" className="block h-auto w-full" />

              <div className="rounded-b-[40px] bg-white px-6 pb-6 pt-6 shadow-xl">
                <div className="relative aspect-square overflow-hidden rounded-[20px] bg-secondary/30">
                  {imageSrc ? (
                    <div className="relative h-full w-full">
                      <Image
                        src={imageSrc}
                        alt={post.title}
                        fill
                        sizes="320px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center type-body-t5 text-primary-75">
                      No image
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 flex w-full items-end justify-between px-4 py-4">
                    {post.view_count > 0 && (
                      <Badge className="bg-[#7c7c7c] px-2 font-ddin text-[14px] font-normal text-white">
                        <EyesIcon className="mr-[4px]" />
                        {post.view_count}
                      </Badge>
                    )}
                    {condition && <Badge>{condition.name}</Badge>}
                  </div>
                </div>

                <h3 className="mt-5 truncate font-ddin text-[28px] font-semibold leading-tight text-gray-900">
                  {post.title}
                </h3>

                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <div
                        key={tag}
                        className="rounded-[10px] bg-secondary px-2 py-1"
                      >
                        <span className="font-ddin text-[16px] font-medium tracking-wider text-megaweave-forest-dark">
                          #{tag}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {locationText && (
                  <div className="mt-4 flex items-center gap-2 text-[16px] font-medium leading-[18px] text-gray-700">
                    <LocationIcon className="shrink-0 text-primary" />
                    <span className="truncate">{locationText}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleInstagramShare}
              className="mt-8 font-ddin text-[16px] font-medium text-white transition-opacity hover:opacity-80"
            >
              Share to Instagram ?
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PostShareModal;
