"use client";

import type { Post } from "@/app/types/schema";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CompactPostCard from "./PostCard/CompactPostCard";
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
        {posts
          .filter((p) => p.status !== "inactive")
          .map((ownerPost) => (
            <CompactPostCard
              key={ownerPost.id}
              post={ownerPost}
              isCurrent={currentPostId === ownerPost.id}
            />
          ))}
      </div>
    </aside>
  );
}
