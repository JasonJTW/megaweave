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

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface WeavesCardProps {
  post?: Post;
  weave?: Weave;
  currentUserId?: number;
  onClick?: () => void;
  isHighlighted?: boolean;
  onWeaveStatusChange?: () => void;
  // ── In-ChatWindow mode ─────────────────────────────────────────
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

type WeaveStatusLabel =
  | "New Request"
  | "Request Sent"
  | "Weaved"
  | "Weaving"
  | "Rejected"
  | "Canceled";

function getWeaveStatusLabel(
  status: Weave["status"] | undefined,
  isGiverRole: boolean,
): WeaveStatusLabel | null {
  if (!status) return null;
  switch (status) {
    case "requested":
      return isGiverRole ? "New Request" : "Request Sent";
    case "completed":
      return "Weaved";
    case "pending":
      return "Weaving";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Canceled";
    default:
      return null;
  }
}

const statusStyles: Record<WeaveStatusLabel, { badge: string; icon: string }> =
  {
    "New Request": {
      badge: "bg-[#FEF3C7] text-[#92400E]",
      icon: "text-[#92400E]",
    },
    "Request Sent": {
      badge: "bg-[#FEF3C7] text-[#92400E]",
      icon: "text-[#92400E]",
    },
    Weaved: { badge: "bg-[#E2E7E0] text-[#3B6232]", icon: "text-[#3B6232]" },
    Weaving: { badge: "bg-[#F5E6D3] text-[#CB5E32]", icon: "text-[#CB5E32]" },
    Rejected: { badge: "bg-[#FEE2E2] text-[#991B1B]", icon: "text-[#991B1B]" },
    Canceled: { badge: "bg-[#EAEAEA] text-[#7C7C7C]", icon: "text-[#7C7C7C]" },
  };

const WeavingCard = ({
  post,
  weave,
  currentUserId,
  onClick,
  isHighlighted,
  onWeaveStatusChange,
  inChatWindow,
}: WeavesCardProps) => {
  const { socket } = useSocket();
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

  // 監聽即時 Socket 狀態更新，在 ChatWindow 中自動重抓最新細節
  useEffect(() => {
    if (!socket || !targetWeaveId) return;

    const handleStatusUpdate = (data: { weaveId: number }) => {
      if (Number(data.weaveId) === Number(targetWeaveId)) {
        fetch(`${hostName}/api/weaves/${targetWeaveId}`, {
          credentials: "include",
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.weave) setFetchedWeave(data.weave);
          })
          .catch((err) => console.error("Error re-fetching weave:", err));
      }
    };

    socket.on("weave_status_updated", handleStatusUpdate);
    return () => {
      socket.off("weave_status_updated", handleStatusUpdate);
    };
  }, [socket, targetWeaveId]);

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

  const thumbnail = isInChatWindow
    ? inChatWindow.imageUrl
    : post
      ? getThumbnail(post)
      : undefined;

  const username = isInChatWindow
    ? inChatWindow.isGiver
      ? "Weaving Request Received"
      : "Weaving Request Sent"
    : post
      ? getDisplayUsername(post, activeWeave, currentUserId)
      : "";

  const currentStatus =
    localStatus ||
    activeWeave?.status ||
    (isInChatWindow ? "requested" : undefined);

  const isGiverRole =
    isGiver || (isInChatWindow ? inChatWindow.isGiver : false);
  const statusLabel = currentStatus
    ? getWeaveStatusLabel(currentStatus, isGiverRole)
    : null;

  const cardTitle = isInChatWindow
    ? inChatWindow.itemTitle
    : post
      ? post.title
      : "";
  const cardContent = isInChatWindow
    ? undefined
    : post
      ? post.content
      : undefined;

  const itemsToDisplay =
    activeWeave?.items && activeWeave.items.length > 0
      ? activeWeave.items.map((it, idx) => ({
          id: it.id || idx,
          title: it.title || "Item",
          quantity: it.quantity,
        }))
      : post?.items || [];

  const visibleItems = isInChatWindow ? [] : itemsToDisplay.slice(0, 2);

  const hasMoreItems = isInChatWindow ? false : itemsToDisplay.length > 2;

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
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
                className={`type-body-t5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-bold ${statusStyles[statusLabel].badge}`}
              >
                <WeavingIcon
                  className={`h-3 w-3 ${statusStyles[statusLabel].icon}`}
                />
                {statusLabel}
              </span>
            )}
          </div>

          {statusLabel && <div className="my-2 border-b border-primary-30" />}

          <p className="type-body-t5 flex min-w-0 items-baseline truncate font-bold text-dark">
            <span
              className={`min-w-0 truncate ${cardContent ? "max-w-[50%]" : "w-full"}`}
            >
              {cardTitle}
            </span>
            {cardContent && (
              <>
                <span className="shrink-0">: </span>
                <span className="min-w-0 max-w-[50%] truncate text-dark">
                  {cardContent}
                </span>
              </>
            )}
          </p>

          {visibleItems.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="type-body-t5 flex items-center justify-between gap-2 text-dark"
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

          {isInChatWindow && (
            <div className="type-body-t5 mt-1.5 flex items-center justify-between">
              <span className="text-primary-75">
                {(() => {
                  const weaveItems = activeWeave?.items || [];
                  const totalTypes = weaveItems.length;
                  const totalQuantity = weaveItems.reduce(
                    (sum, item) => sum + (Number(item.quantity) || 1),
                    0,
                  );

                  if (
                    inChatWindow.itemTitle === "all" ||
                    inChatWindow.itemTitle.startsWith("All Items - ")
                  ) {
                    return "Request all items";
                  }

                  if (totalTypes > 1) {
                    return `Request: ${totalTypes} items (${totalQuantity} total)`;
                  }

                  const singleQty =
                    totalQuantity > 0 ? totalQuantity : inChatWindow.quantity;
                  return `Request Qty: ${singleQty}`;
                })()}
              </span>
              <Link
                // href={`/user?highlightWeaveId=${inChatWindow.weaveId}`}
                href={`/item/${activeWeave?.post_id}`}
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
  );
};

export default WeavingCard;
