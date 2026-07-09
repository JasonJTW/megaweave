"use client";

import type { Weave } from "@/services/weaveService";
import Image from "next/image";
import Link from "next/link";
import { User as UserIcon } from "lucide-react";
import React from "react";
import type { Post } from "../types/schema";
import AcceptIcon from "./icons/AcceptIcon";
import CancelIcon from "./icons/CancelIcon";
import WeavingIcon from "./icons/WeavingIcon";
import { useWeaveActions } from "@/hooks/useWeaveActions";


interface WeavesCardProps {
  post?: Post;
  weave?: Weave;
  currentUserId?: number;
  onClick?: () => void;
  isHighlighted?: boolean;
  onWeaveStatusChange?: () => void;
  // ── Compact / chat-inline mode ─────────────────────────────────────────
  // When these are provided, the card renders a compact summary card
  // (used in ChatWindow) without requiring a full Post or Weave object.
  compactMode?: {
    itemTitle: string;
    quantity: number;
    imageUrl?: string;
    weaveId: number | string;
    isGiver: boolean;
  };
}

function getThumbnail(post: Post): string | undefined {
  if (post.thumbnail_urls) {
    if (Array.isArray(post.thumbnail_urls)) return post.thumbnail_urls[0];
    const urls = post.thumbnail_urls.split(",").filter(Boolean);
    if (urls[0]) return urls[0];
  }
  if (post.image_urls) {
    if (Array.isArray(post.image_urls)) return post.image_urls[0];
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
    Weaved: { badge: "bg-[#E2E7E0] text-[#3B6232]", icon: "text-[#3B6232]" },
    Weaving: { badge: "bg-[#F5E6D3] text-[#CB5E32]", icon: "text-[#CB5E32]" },
    Canceled: { badge: "bg-[#EAEAEA] text-[#7C7C7C]", icon: "text-[#7C7C7C]" },
  };

const WeavingCard = ({
  post,
  weave,
  currentUserId,
  onClick,
  isHighlighted,
  onWeaveStatusChange,
  compactMode,
}: WeavesCardProps) => {
  // ── Compact mode (chat inline card) ────────────────────────────────────
  if (compactMode) {
    const { itemTitle, quantity, imageUrl, weaveId, isGiver } = compactMode;
    return (
      <div className="flex w-full flex-col rounded-[20px] bg-white p-3 text-left">
        {/* Row 1: thumbnail + item info — mirrors full-mode Row 1 */}
        <div className="flex w-full gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-secondary/50">
            {imageUrl ? (
              <Image src={imageUrl} alt={itemTitle} fill sizes="72px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-primary-75">
                No image
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="type-h5 text-primary">
                {isGiver ? "Weaving Request Received" : "Weaving Request Sent"}
              </span>
              <span className="inline-flex font-bold shrink-0 items-center gap-1 rounded-full px-2 py-0.5 type-body-t5 bg-[#F5E6D3] text-[#CB5E32]">
                <WeavingIcon className="h-3 w-3 text-[#CB5E32]" />
                Weaving
              </span>
            </div>

            <div className="my-2 border-b border-primary-30" />

            <p className="type-body-t5 font-bold text-dark truncate">{itemTitle}</p>

            <div className="mt-1 flex items-center justify-between">
              <span className="type-body-t5 text-primary-75">Qty: {quantity}</span>
              <Link
                href={`/user?highlightWeaveId=${weaveId}`}
                onClick={(e) => e.stopPropagation()}
                className="type-body-t5 text-primary hover:underline font-bold"
              >
                View Detail →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full mode requires a post object
  if (!post) return null;

  const thumbnail = getThumbnail(post);
  const username = getDisplayUsername(post, weave, currentUserId);
  const items = post.items ?? [];
  const visibleItems = items.slice(0, 2);
  const hasMoreItems = items.length > 2;

  const {
    isReceiver,
    hasIConfirmed,
    hasOtherConfirmed,
    localStatus,
    isProcessing,
    handleCompleteWeave,
    handleCancelWeave,
  } = useWeaveActions({ weave, currentUserId, onWeaveStatusChange });

  const currentStatus = localStatus || weave?.status;
  const statusLabel = currentStatus ? getWeaveStatusLabel(currentStatus) : null;

  const displayUser =
    weave && currentUserId
      ? currentUserId === weave.giver_id
        ? {
            name: weave.receiver_name,
            avatar: weave.receiver_avatar,
            role: "Receiver",
          }
        : { name: weave.giver_name, avatar: weave.giver_avatar, role: "Giver" }
      : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClick}
      className={`flex w-full flex-col rounded-[20px] bg-white p-3 text-left transition-shadow hover:shadow-sm cursor-pointer ${
        isHighlighted ? "ring-2 ring-primary/40" : ""
      }`}
    >
      {/* Row 1: thumbnail + post info + status badge */}
      <div className="flex w-full gap-3">
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
            <span className="type-h5 text-primary">{username}</span>
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
            {post.content && (
              <>
                <span className="shrink-0">: </span>
                <span className="min-w-0 max-w-[50%] truncate text-dark">
                  {post.content}
                </span>
              </>
            )}
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
      </div>

      {/* Row 2: displayUser info + action buttons (only when weave exists) */}
      {displayUser && (
        <div
          className="mt-3 w-full bg-primary-5 rounded-[16px] px-[16px] py-[10px] flex items-center gap-2 text-gray-600 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {displayUser.avatar ? (
            <div className="w-9 h-9 rounded-full overflow-hidden relative flex-shrink-0">
              <Image
                src={displayUser.avatar}
                alt={displayUser.name}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-5 h-5 text-gray-600" />
            </div>
          )}

          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[#222] type-body-t4 font-semibold">
              {displayUser.name}
            </span>
            <span className="text-[#666] type-body-t5">{displayUser.role}</span>

            {currentStatus === "pending" && (
              <div className="mt-1 flex flex-col gap-1">
                {!hasIConfirmed ? (
                  <span className="text-orange-500 text-xs font-medium">
                    {isReceiver
                      ? "Received the item? Click the checkmark to confirm."
                      : "Handed over the item? Click the checkmark to confirm."}
                  </span>
                ) : !hasOtherConfirmed ? (
                  <span className="text-blue-600 text-xs mt-1 animate-pulse">
                    {isReceiver
                      ? `Received confirmed. Waiting for ${displayUser.name} to confirm handover...`
                      : `Handover confirmed. Waiting for ${displayUser.name} to confirm receipt...`}
                  </span>
                ) : null}

                {!hasIConfirmed && hasOtherConfirmed && (
                  <span className="text-green-600 text-xs font-bold">
                    {isReceiver
                      ? `${displayUser.name} confirmed handover. Please confirm receipt!`
                      : `${displayUser.name} confirmed receipt. Please confirm handover!`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons — pending only */}
          {currentStatus === "pending" && (
            <div className="text-megaweave-forest-dark flex gap-[16px] ml-auto shrink-0">
              <button
                onClick={handleCompleteWeave}
                disabled={isProcessing || hasIConfirmed}
                className={`transition-all ${hasIConfirmed ? "text-green-500" : "text-megaweave-forest-dark"} ${isProcessing ? "opacity-50" : ""}`}
                title={hasIConfirmed ? "You have confirmed" : "Complete weave"}
              >
                <AcceptIcon
                  className={`w-[18px] h-auto ${hasIConfirmed ? "stroke-[3px]" : ""}`}
                />
              </button>
              <button
                onClick={handleCancelWeave}
                disabled={isProcessing}
                className={`transition-opacity ${isProcessing ? "opacity-50" : "hover:opacity-70"}`}
                title="Cancel weave"
              >
                <CancelIcon className="w-[18px] h-auto" />
              </button>
            </div>
          )}

          {/* Final status */}
          {currentStatus !== "pending" && (
            <div className="ml-auto">
              <span
                className={`text-sm font-semibold ${
                  currentStatus === "completed"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {currentStatus === "completed" ? "✓ Completed" : "✗ Cancelled"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WeavingCard;
