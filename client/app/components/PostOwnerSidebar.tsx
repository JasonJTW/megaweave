"use client";

import type { Post } from "@/app/types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommonShareIcon from "./icons/CommonShareIcon";
import ElfIcon from "./icons/ElfIcon";
import ReuseIcon from "./icons/ReuseIcon";
import WeavingIcon from "./icons/WeavingIcon";

interface PostOwnerSidebarProps {
  username: string;
  avatarUrl?: string;
  contactEmail?: string | null;
  authorPublicId: string;
  posts: Post[];
  currentPostId?: number;
}

function getPostImageSrc(post: Post): string | null {
  const keys = parseS3Keys(post);
  if (!keys[0]) return null;
  return keys[0].startsWith("http") ? keys[0] : getImageUrl(keys[0], "thumb");
}

export default function PostOwnerSidebar({
  username,
  avatarUrl,
  contactEmail,
  authorPublicId,
  posts,
  currentPostId,
}: PostOwnerSidebarProps) {
  const router = useRouter();

  return (
    <aside className="sticky top-28 hidden w-[280px] shrink-0 flex-col items-center font-ddin lg:flex xl:w-[300px]">
      {/* Logo */}
      <Link
        href="/"
        className="mb-8 grid w-full max-w-[220px] grid-cols-2 grid-rows-2 gap-1"
        aria-label="Megaweave home"
      >
        <ReuseIcon className="h-full w-full text-megaweave-gold" />
        <WeavingIcon className="h-full w-full text-megaweave-forest" />
        <ElfIcon className="h-full w-full text-megaweave-red-dark" />
        <CommonShareIcon className="h-full w-full text-megaweave-blue" />
      </Link>

      {/* Owner avatar */}
      <button
        type="button"
        onClick={() => router.push(`/profile/${authorPublicId}`)}
        className="relative mb-4 aspect-square w-full max-w-[220px] overflow-hidden rounded-[24px] bg-secondary/50"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${username}'s avatar`}
            fill
            className="object-cover"
            sizes="220px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-megaweave-forest-dark">
            {username ? username.charAt(0).toUpperCase() : "?"}
          </div>
        )}
      </button>

      {/* Name & email */}
      <button
        type="button"
        onClick={() => router.push(`/profile/${authorPublicId}`)}
        className="mb-1 text-center text-[22px] font-bold text-gray-900 hover:text-primary"
      >
        {username || "User"}
      </button>
      {contactEmail && (
        <a
          href={`mailto:${contactEmail}`}
          className="mb-8 text-center text-[14px] text-gray-500 hover:underline"
        >
          {contactEmail}
        </a>
      )}
      {!contactEmail && <div className="mb-8" />}

      {/* Owner posts */}
      <div className="flex w-full flex-col gap-3">
        {posts.map((ownerPost) => {
          const imageSrc = getPostImageSrc(ownerPost);
          const tags = ownerPost.tags
            ? ownerPost.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 3)
            : [];
          const isCurrent = currentPostId === ownerPost.id;

          return (
            <button
              key={ownerPost.id}
              type="button"
              onClick={() => router.push(`/item/${ownerPost.id}`)}
              className={`flex w-full gap-3 rounded-[20px] bg-white p-2.5 text-left shadow-sm transition-colors hover:bg-white/90 ${
                isCurrent ? "ring-1 ring-primary/40" : ""
              }`}
            >
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-secondary/40">
                {imageSrc ? (
                  <Image
                    src={imageSrc}
                    alt={ownerPost.title}
                    fill
                    className="object-cover"
                    sizes="72px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-400">
                    {ownerPost.title.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <div>
                  <h3 className="truncate text-[16px] font-bold text-gray-900">
                    {ownerPost.title}
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
                    {ownerPost.likes_count ?? 0}
                  </span>
                  <ReuseIcon className="h-5 w-5 text-megaweave-gold" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
