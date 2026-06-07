"use client";

import type { Weave } from "@/services/weaveService";
import Image from "next/image";
import type { Post } from "../types/schema";
import WeavingIcon from "./icons/WeavingIcon";

interface DrawerListItemProps {
  post: Post;
  weave?: Weave;
  currentUserId?: number;
  onClick: () => void;
  isHighlighted?: boolean;
}

function getThumbnail(post: Post): string | undefined {
  if (post.thumbnail_urls) {
    if (Array.isArray(post.thumbnail_urls)) {
      return post.thumbnail_urls[0];
    }
    const urls = post.thumbnail_urls.split(",").filter(Boolean);
    if (urls[0]) return urls[0];
  }

  if (post.image_urls) {
    if (Array.isArray(post.image_urls)) {
      return post.image_urls[0];
    }
    const urls = post.image_urls.split(",").filter(Boolean);
    if (urls[0]) return urls[0];
  }

  return undefined;
}

function getDisplayUsername(
  post: Post,
  weave: Weave | undefined,
  currentUserId?: number,
): string {
  if (weave && currentUserId) {
    return currentUserId === weave.giver_id
      ? weave.receiver_name
      : weave.giver_name;
  }
  return post.username;
}

type WeaveStatusLabel = "Weaved" | "Weaving" | "Canceled";

function getWeaveStatusLabel(status: Weave["status"]): WeaveStatusLabel | null {
  switch (status) {
    case "completed":
      return "Weaved";
    case "pending":
      return "Weaving";
    case "cancelled":
      return "Canceled";
    default:
      return null;
  }
}

const statusStyles: Record<WeaveStatusLabel, { badge: string; icon: string }> =
  {
    Weaved: {
      badge: "bg-[#E2E7E0] text-[#3B6232]",
      icon: "text-[#3B6232]",
    },
    Weaving: {
      badge: "bg-[#F5E6D3] text-[#CB5E32]",
      icon: "text-[#CB5E32]",
    },
    Canceled: {
      badge: "bg-[#EAEAEA] text-[#7C7C7C]",
      icon: "text-[#7C7C7C]",
    },
  };

const DrawerListItem = ({
  post,
  weave,
  currentUserId,
  onClick,
  isHighlighted,
}: DrawerListItemProps) => {
  const thumbnail = getThumbnail(post);
  const username = getDisplayUsername(post, weave, currentUserId);
  const statusLabel = weave ? getWeaveStatusLabel(weave.status) : null;
  const items = post.items ?? [];
  const visibleItems = items.slice(0, 2);
  const hasMoreItems = items.length > 2;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full gap-3 rounded-[20px] bg-white p-3 text-left transition-shadow hover:shadow-sm ${
        isHighlighted ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-secondary/50">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={post.title}
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-primary-75">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {/* <span className="type-h5 text-primary">{username}</span> */}
          {statusLabel && (
            <span
              className={`inline-flex font-bold shrink-0 items-center gap-1 rounded-full px-2 py-0.5 type-body-t5 ${statusStyles[statusLabel].badge}`}
            >
              <WeavingIcon
                className={`h-3 w-3 ${statusStyles[statusLabel].icon}`}
              />
              {statusLabel}
            </span>
          )}
        </div>

        {statusLabel && <div className="my-2 border-b border-primary-30" />}

        <p className="flex min-w-0 items-baseline type-body-t5 font-bold text-dark">
          <span
            className={`min-w-0 truncate text-dark ${post.content ? "max-w-[50%]" : ""}`}
          >
            {post.title}
          </span>
          {post.content ? (
            <>
              <span className="shrink-0">: </span>
              <span className="min-w-0 max-w-[50%] truncate text-dark">
                {post.content}
              </span>
            </>
          ) : null}
        </p>

        {visibleItems.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 type-body-t5 text-dark"
              >
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-primary-75">
                  *{item.quantity}
                </span>
              </div>
            ))}
            {hasMoreItems && (
              <p className="type-body-t5 text-primary-75">......</p>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

export default DrawerListItem;
