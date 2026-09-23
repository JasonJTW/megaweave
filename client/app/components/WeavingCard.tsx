"use client";

import type { Weave } from "@/services/weaveService";
import Image from "next/image";
import Link from "next/link";
import { User as UserIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import type { Post } from "../types/schema";
import AcceptIcon from "./icons/AcceptIcon";
import CancelIcon from "./icons/CancelIcon";
import WeavingIcon from "./icons/WeavingIcon";
import { useWeaveActions } from "@/hooks/useWeaveActions";
import { useSocket } from "@/hooks/useSocket";
import LalamoveQuotation from "./Lalamove/LalamoveQuotation";
import { shouldShowLalamoveQuotation } from "@/utils/weaveGuard";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface WeavesCardProps {
  post?: Post;
  weave?: Weave;
  currentUserId?: number;
  onClick?: () => void;
  isHighlighted?: boolean;
  onWeaveStatusChange?: () => void;
  // ── In-ChatWindow mode ───────────────────────────────────────────────
  // When these are provided, the card renders a compact summary card
  // (used in ChatWindow) without requiring a full Post or Weave object.
  inChatWindow?: {
    itemTitle: string;
    quantity: number | string;
    imageUrl?: string;
    weaveId: number | string;
    isGiver: boolean;
  };
}

function getThumbnail(post: Post): string | undefined {
  const keys = parseS3Keys(post);
  if (!keys[0]) return undefined;
  return keys[0].startsWith("http") ? keys[0] : getImageUrl(keys[0], "thumb");
}

const WeavingCard = ({
  post,
  weave,
  currentUserId,
  onClick,
  isHighlighted,
  onWeaveStatusChange,
  inChatWindow,
}: WeavesCardProps) => {
  const [fetchedWeave, setFetchedWeave] = useState<Weave | undefined>(
    undefined,
  );

  const activeWeave = weave || fetchedWeave;
  const targetWeaveId = weave?.id || inChatWindow?.weaveId;

  // 自動拉取單筆 Weave 詳情 (當在 ChatWindow 中只傳入 weaveId 時)
  useEffect(() => {
    if (weave || !targetWeaveId) return;
    let isMounted = true;
    const fetchWeaveData = async () => {
      try {
        const res = await fetch(`${hostName}/api/weaves/${targetWeaveId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.weave) {
            setFetchedWeave(data.weave);
          }
        }
      } catch (err) {
        console.error("Failed to fetch weave detail in WeavingCard:", err);
      }
    };
    fetchWeaveData();
    return () => {
      isMounted = false;
    };
  }, [weave, targetWeaveId]);

  // 監聽即時更新 (當狀態變更時重新拉取資料)
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket || !targetWeaveId) return;

    const handleWeaveUpdated = (updatedWeave: Weave) => {
      if (Number(updatedWeave.id) === Number(targetWeaveId)) {
        setFetchedWeave(updatedWeave);
        if (onWeaveStatusChange) onWeaveStatusChange();
      }
    };

    socket.on("weave_status_updated", handleWeaveUpdated);
    return () => {
      socket.off("weave_status_updated", handleWeaveUpdated);
    };
  }, [socket, targetWeaveId, onWeaveStatusChange]);

  const {
    isGiver,
    isReceiver,
    hasIConfirmed,
    hasOtherConfirmed,
    localStatus,
    isProcessing,
    handleApproveWeave,
    handleRejectWeave,
    handleCompleteWeave,
    handleCancelWeave,
  } = useWeaveActions({
    weave: activeWeave,
    currentUserId,
    onWeaveStatusChange,
  });

  // Early return only if neither inChatWindow nor post is provided
  if (!inChatWindow && !post) return null;

  const isInChatWindow = !!inChatWindow;

  // Derive thumbnail
  const thumbnail = isInChatWindow
    ? inChatWindow.imageUrl || (post ? getThumbnail(post) : undefined)
    : post
      ? getThumbnail(post)
      : undefined;

  // Derive title
  const cardTitle = isInChatWindow
    ? inChatWindow.itemTitle
    : post?.title || activeWeave?.post_title || "Unknown Post";

  // Derive status
  // When in chat window and activeWeave hasn't loaded yet,
  // the card represents an initiated weave → default to "requested"
  const currentStatus =
    localStatus ||
    activeWeave?.status ||
    (isInChatWindow ? "requested" : undefined);

  // Status badge style
  const getBadgeStyle = (status?: string) => {
    switch (status) {
      case "requested":
        return "bg-amber-100 text-amber-800";
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case "requested":
        return "Requested";
      case "pending":
        return "Pending";
      case "completed":
        return "Completed";
      case "rejected":
        return "Rejected";
      case "cancelled":
        return "Cancelled";
      default:
        return status ? status.charAt(0).toUpperCase() + status.slice(1) : "";
    }
  };

  // User display info (Row 2)
  // In inChatWindow mode before activeWeave loads, fallback to generic role label
  const displayUser =
    activeWeave && currentUserId
      ? currentUserId === activeWeave.giver_id
        ? {
            name: activeWeave.receiver_name,
            avatar: activeWeave.receiver_avatar,
            role: "Receiver",
          }
        : {
            name: activeWeave.giver_name,
            avatar: activeWeave.giver_avatar,
            role: "Giver",
          }
      : isInChatWindow
        ? {
            name: inChatWindow.isGiver ? "Receiver" : "Giver",
            avatar: "",
            role: inChatWindow.isGiver ? "Receiver" : "Giver",
          }
        : null;

  const targetPost = post || activeWeave?.post;
  const showQuotation = shouldShowLalamoveQuotation({
    isInChatWindow,
    status: currentStatus,
    hasPost: Boolean(targetPost),
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col">
      <div
        onClick={isInChatWindow ? undefined : onClick}
        className={`flex w-full flex-col rounded-[20px] bg-white p-3 text-left transition-shadow hover:shadow-sm ${
          isInChatWindow ? "" : "cursor-pointer"
        } ${isHighlighted ? "ring-2 ring-primary/40" : ""}`}
      >
        {/* Row 1: thumbnail + post info + status badge */}
        <div className="flex w-full gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-secondary/50">
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt={cardTitle}
                fill
                sizes="72px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                <WeavingIcon className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="type-body-t4 line-clamp-1 font-semibold text-[#222]">
                {cardTitle}
              </span>
              {currentStatus && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeStyle(currentStatus)}`}
                >
                  {getStatusText(currentStatus)}
                </span>
              )}
            </div>

            {/* In full mode, show post location / notes snippet */}
            {!isInChatWindow && (
              <p className="line-clamp-1 text-xs text-gray-400">
                {post?.full_address || post?.location_name || post?.city || ""}
              </p>
            )}

            {/* In inChatWindow mode, show item title + quantity */}
            {isInChatWindow && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="truncate">
                  {(() => {
                    const action = inChatWindow.isGiver ? "Give" : "Request";

                    const rawItems = activeWeave?.items;
                    let parsedItems: Array<{
                      title?: string | null;
                      quantity?: number;
                    }> = [];
                    if (Array.isArray(rawItems)) {
                      parsedItems = rawItems;
                    } else if (typeof rawItems === "string") {
                      try {
                        parsedItems = JSON.parse(rawItems);
                      } catch {
                        parsedItems = [];
                      }
                    }

                    const isAll =
                      !inChatWindow.itemTitle ||
                      inChatWindow.itemTitle.toLowerCase() === "all" ||
                      inChatWindow.itemTitle.toLowerCase() === "all items";

                    const totalQuantity = parsedItems.reduce(
                      (acc, item) => acc + (Number(item.quantity) || 1),
                      0,
                    );
                    const totalTypes = parsedItems.length;

                    if (isAll) {
                      return `${action} all items`;
                    }

                    if (totalTypes > 1) {
                      return `${action}: ${totalTypes} items (${totalQuantity} total)`;
                    }

                    const singleQty =
                      totalQuantity > 0 ? totalQuantity : inChatWindow.quantity;
                    return `${action} Qty: ${singleQty}`;
                  })()}
                </span>
                <Link
                  // href={`/user?highlightWeaveId=${inChatWindow.weaveId}`}
                  href={`/item/${activeWeave?.post?.public_id || activeWeave?.post_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  View Post Detail →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: displayUser info + action buttons (only when weave exists) */}
        {displayUser && (
          <div
            className="mt-3 flex w-full items-center gap-2 rounded-[16px] bg-primary-5 px-[16px] py-[10px] text-sm text-gray-600"
            onClick={(e) => e.stopPropagation()}
          >
            {displayUser.avatar ? (
              <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full">
                <Image
                  src={displayUser.avatar}
                  alt={displayUser.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-300">
                <UserIcon className="h-5 w-5 text-gray-600" />
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-t4 font-semibold text-[#222]">
                {displayUser.name}
              </span>
              <span className="type-body-t5 text-[#666]">{displayUser.role}</span>

              {currentStatus === "requested" && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-xs font-medium text-amber-600">
                    {isGiver
                      ? "Requested by receiver. Approve or reject this request?"
                      : "Waiting for giver's approval..."}
                  </span>
                </div>
              )}

              {currentStatus === "pending" && (
                <div className="mt-1 flex flex-col gap-1">
                  {!hasIConfirmed ? (
                    <span className="text-xs font-medium text-orange-500">
                      {isReceiver
                        ? "Received the item? Click the checkmark to confirm."
                        : "Handed over the item? Click the checkmark to confirm."}
                    </span>
                  ) : !hasOtherConfirmed ? (
                    <span className="mt-1 animate-pulse text-xs text-blue-600">
                      {isReceiver
                        ? `Received confirmed. Waiting for ${displayUser.name} to confirm handover...`
                        : `Handover confirmed. Waiting for ${displayUser.name} to confirm receipt...`}
                    </span>
                  ) : null}

                  {!hasIConfirmed && hasOtherConfirmed && (
                    <span className="text-xs font-bold text-green-600">
                      {isReceiver
                        ? `${displayUser.name} confirmed handover. Please confirm receipt!`
                        : `${displayUser.name} confirmed receipt. Please confirm handover!`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons — requested state */}
            {currentStatus === "requested" && (
              <div className="ml-auto flex shrink-0 gap-[16px] text-megaweave-forest-dark">
                {isGiver ? (
                  <>
                    <button
                      onClick={handleApproveWeave}
                      disabled={isProcessing}
                      className={`transition-all hover:text-green-600 ${isProcessing ? "opacity-50" : ""}`}
                      title="Approve request"
                    >
                      <AcceptIcon className="h-auto w-[18px]" />
                    </button>
                    <button
                      onClick={handleRejectWeave}
                      disabled={isProcessing}
                      className={`transition-all hover:text-red-600 ${isProcessing ? "opacity-50" : ""}`}
                      title="Reject request"
                    >
                      <CancelIcon className="h-auto w-[18px]" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleCancelWeave}
                    disabled={isProcessing}
                    className={`transition-opacity ${isProcessing ? "opacity-50" : "hover:opacity-70"}`}
                    title="Cancel request"
                  >
                    <CancelIcon className="h-auto w-[18px]" />
                  </button>
                )}
              </div>
            )}

            {/* Action buttons — pending state */}
            {currentStatus === "pending" && (
              <div className="ml-auto flex shrink-0 gap-[16px] text-megaweave-forest-dark">
                <button
                  onClick={handleCompleteWeave}
                  disabled={isProcessing || hasIConfirmed}
                  className={`transition-all ${hasIConfirmed ? "text-green-500" : "text-megaweave-forest-dark"} ${isProcessing ? "opacity-50" : ""}`}
                  title={hasIConfirmed ? "You have confirmed" : "Complete weave"}
                >
                  <AcceptIcon
                    className={`h-auto w-[18px] ${hasIConfirmed ? "stroke-[3px]" : ""}`}
                  />
                </button>
                <button
                  onClick={handleCancelWeave}
                  disabled={isProcessing}
                  className={`transition-opacity ${isProcessing ? "opacity-50" : "hover:opacity-70"}`}
                  title="Cancel weave"
                >
                  <CancelIcon className="h-auto w-[18px]" />
                </button>
              </div>
            )}

            {/* Final status */}
            {currentStatus !== "requested" && currentStatus !== "pending" && (
              <div className="ml-auto">
                <span
                  className={`text-sm font-semibold ${
                    currentStatus === "completed"
                      ? "text-green-600"
                      : currentStatus === "rejected"
                        ? "text-red-600"
                        : "text-gray-500"
                  }`}
                >
                  {currentStatus === "completed"
                    ? "✓ Completed"
                    : currentStatus === "rejected"
                      ? "✗ Rejected"
                      : "✗ Cancelled"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* When in ChatWindow and status === "pending", show LalamoveQuotation below WeavingCard */}
      {showQuotation && targetPost && (
        <div className="w-full">
          <LalamoveQuotation
            post={targetPost}
            hasPendingWeaveOverride={true}
            className="my-3 overflow-hidden rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 p-4 shadow-sm transition-all sm:p-5"
          />
        </div>
      )}
    </div>
  );
};

export default WeavingCard;
