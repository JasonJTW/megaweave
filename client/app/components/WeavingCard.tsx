"use client";

import { Link } from "@/i18n/navigation";
import type { Weave, WeaveCommand, WeaveRole } from "@/lib/weave";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { User as UserIcon } from "lucide-react";
import React from "react";
import toast from "react-hot-toast";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import type { Post } from "../types/schema";
import AcceptIcon from "./icons/AcceptIcon";
import CancelIcon from "./icons/CancelIcon";
import WeavingIcon from "./icons/WeavingIcon";
import { useWeave } from "@/hooks/useWeave";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import LalamoveQuotation from "./Lalamove/LalamoveQuotation";
import { shouldShowLalamoveQuotation } from "@/utils/weaveGuard";
import { getWeaveStatusKey, type WeaveStatusKey } from "@/utils/weaveViewModel";
import { useDisplayName } from "@/hooks/useDisplayName";

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
    /** Weave 還沒載入時的物品流向（lib/weave draftRole）；載入後看 viewer.role */
    fallbackRole: WeaveRole | undefined;
    isPostAuthor: boolean;
  };
}

function getThumbnail(post: Post): string | undefined {
  const keys = parseS3Keys(post);
  if (!keys[0]) return undefined;
  return keys[0].startsWith("http") ? keys[0] : getImageUrl(keys[0], "thumb");
}

/** 對方的名字：我是 Giver 就顯示 Receiver，反之顯示 Giver（看 viewer.role，不比對 giver_id：組織 Weave 會遮蔽它） */
function getDisplayUsername(post: Post, weave: Weave | undefined): string {
  const role = weave?.viewer?.role;
  if (!weave || !role) return post.username;
  return role === "giver" ? weave.receiver_name : weave.giver_name;
}

const statusStyles: Record<WeaveStatusKey, { badge: string; icon: string }> = {
  newRequest: {
    badge: "bg-[#FEF3C7] text-[#92400E]",
    icon: "text-[#92400E]",
  },
  requestSent: {
    badge: "bg-[#FEF3C7] text-[#92400E]",
    icon: "text-[#92400E]",
  },
  weaved: { badge: "bg-[#E2E7E0] text-[#3B6232]", icon: "text-[#3B6232]" },
  weaving: { badge: "bg-[#F5E6D3] text-[#CB5E32]", icon: "text-[#CB5E32]" },
  declined: { badge: "bg-[#FEE2E2] text-[#991B1B]", icon: "text-[#991B1B]" },
  withdrawn: { badge: "bg-[#EAEAEA] text-[#7C7C7C]", icon: "text-[#7C7C7C]" },
  cancelled: { badge: "bg-[#EAEAEA] text-[#7C7C7C]", icon: "text-[#7C7C7C]" },
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
  const t = useTranslations("WeaveCard");
  const displayName = useDisplayName();
  const apiErrorMessage = useApiErrorMessage();
  const {
    weave: activeWeave,
    view,
    hasIConfirmed,
    isProcessing,
    perform,
  } = useWeave(weave?.id ?? inChatWindow?.weaveId, weave);
  const availableActions = view.actions;
  const hintKey = view.hintKey;

  //* 提示與通知文字留在卡片；能不能做由 server 的 viewer.commands 決定（useWeave）
  const run = async (e: React.MouseEvent, command: WeaveCommand) => {
    e.stopPropagation();
    const prompt = {
      approve: null,
      decline: "prompts.decline",
      withdraw: "prompts.withdraw",
      cancel: "prompts.cancel",
      confirm:
        activeWeave?.viewer?.role === "receiver"
          ? "prompts.confirmReceipt"
          : "prompts.confirmHandover",
    } as const;
    const failed = {
      approve: "toast.approveFailed",
      decline: "toast.declineFailed",
      withdraw: "toast.withdrawFailed",
      cancel: "toast.cancelFailed",
      confirm: "toast.confirmFailed",
    } as const;
    const ask = prompt[command];
    if (ask && !window.confirm(t(ask))) return;
    try {
      const result = await perform(command);
      if (!result) return;
      const done = {
        approve: "toast.approved",
        decline: "toast.declined",
        withdraw: "toast.withdrawn",
        cancel: "toast.cancelled",
        confirm:
          result.newStatus === "completed"
            ? "toast.completed"
            : "toast.confirmedWaiting",
      } as const;
      toast.success(t(done[command]));
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, t(failed[command])));
    }
  };
  const handleApproveWeave = (e: React.MouseEvent) => run(e, "approve");
  const handleRejectWeave = (e: React.MouseEvent) => run(e, "decline");
  const handleCompleteWeave = (e: React.MouseEvent) => run(e, "confirm");
  const handleCancelWeave = (e: React.MouseEvent) => run(e, "cancel");
  const handleWithdrawWeave = (e: React.MouseEvent) => run(e, "withdraw");

  // Early return only if neither inChatWindow nor post is provided
  if (!inChatWindow && !post) return null;

  const isInChatWindow = !!inChatWindow;

  const thumbnail = isInChatWindow
    ? inChatWindow.imageUrl
    : post
      ? getThumbnail(post)
      : undefined;

  const username = isInChatWindow
    ? t("chatHeading", {
        viewer: inChatWindow.isPostAuthor ? "author" : "initiator",
      })
    : post
      ? displayName(getDisplayUsername(post, activeWeave))
      : "";

  const currentStatus =
    activeWeave?.status || (isInChatWindow ? "requested" : undefined);

  // Weave not loaded yet (chat window): fall back to the Post Author flag.
  const statusKey =
    view.statusKey ??
    getWeaveStatusKey(
      currentStatus,
      isInChatWindow ? inChatWindow.isPostAuthor : false,
    );
  const statusLabel = statusKey ? t(`status.${statusKey}`) : null;

  const cardTitle = isInChatWindow
    ? activeWeave?.post_title ||
      (inChatWindow.itemTitle && inChatWindow.itemTitle.toLowerCase() !== "all"
        ? inChatWindow.itemTitle
        : post?.title || t("fallbackTitle"))
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
          title: it.title || (it.item_id === null ? t("allItems") : t("item")),
          quantity: it.quantity,
        }))
      : post?.items || [];

  const visibleItems = isInChatWindow ? [] : itemsToDisplay.slice(0, 2);

  const hasMoreItems = isInChatWindow ? false : itemsToDisplay.length > 2;

  //* 我是哪一方：有 Weave 看 viewer.role；聊天室裡還沒載入就用草稿的推導
  const myRole =
    activeWeave?.viewer?.role ??
    (isInChatWindow ? inChatWindow.fallbackRole : undefined);
  const displayUser =
    activeWeave && currentUserId && activeWeave.viewer?.role
      ? myRole === "giver"
        ? {
            name: displayName(activeWeave.receiver_name),
            avatar: activeWeave.receiver_avatar,
            role: t("role.receiver"),
          }
        : {
            name: displayName(activeWeave.giver_name),
            avatar: activeWeave.giver_avatar,
            role: t("role.giver"),
          }
      : isInChatWindow
        ? {
            name: t(myRole === "giver" ? "role.receiver" : "role.giver"),
            avatar: "",
            role: t(myRole === "giver" ? "role.receiver" : "role.giver"),
          }
        : null;

  const confirmLabel = t(
    hasIConfirmed ? "actions.confirmed" : "actions.confirm",
  );

  const quotationPost = post || activeWeave?.post;
  const showQuotation = shouldShowLalamoveQuotation({
    isInChatWindow,
    status: currentStatus,
    hasPost: Boolean(quotationPost),
    isOrgItem: quotationPost?.org_id != null,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
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
                {t("noImage")}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="type-h5 text-primary">{username}</span>
              {statusKey && statusLabel && (
                <span
                  className={`type-body-t5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-bold ${statusStyles[statusKey].badge}`}
                >
                  <WeavingIcon
                    className={`h-3 w-3 ${statusStyles[statusKey].icon}`}
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

                    const lowerTitle =
                      inChatWindow.itemTitle?.toLowerCase() || "";
                    const isAll =
                      lowerTitle === "all" ||
                      lowerTitle.startsWith("all items") ||
                      (weaveItems.length > 0 &&
                        weaveItems.every((it) => it.item_id === null));

                    const direction = myRole === "giver" ? "give" : "receive";

                    if (isAll) {
                      return t("chatSummary.all", { direction });
                    }

                    if (totalTypes > 1) {
                      return t("chatSummary.multiple", {
                        direction,
                        types: totalTypes,
                        total: totalQuantity,
                      });
                    }

                    const singleQty =
                      totalQuantity > 0 ? totalQuantity : inChatWindow.quantity;
                    return t("chatSummary.single", {
                      direction,
                      quantity: singleQty,
                    });
                  })()}
                </span>
                {activeWeave?.post?.public_id && (
                  <Link
                    // href={`/user?highlightWeaveId=${inChatWindow.weaveId}`}
                    href={`/item/${activeWeave.post.public_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    {t("viewPost")}
                  </Link>
                )}
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
              <span className="type-body-t5 text-[#666]">
                {displayUser.role}
              </span>
              {/* 組織物品流向的單位（#137、ADR 0004）；個人 Weave 沒有 */}
              {activeWeave?.receiver_org_unit && (
                <span className="type-body-t5 text-[#666]">
                  {t("receiverUnit", {
                    unit: activeWeave.receiver_org_unit.name,
                  })}
                </span>
              )}

              {hintKey && (
                <span
                  className={`mt-1 text-xs ${
                    hintKey === "requested.decideOnRequest" ||
                    hintKey === "requested.awaitingAuthor"
                      ? "font-medium text-amber-600"
                      : hintKey.startsWith("approved.waiting")
                        ? "animate-pulse text-blue-600"
                        : hintKey.includes("Please")
                          ? "font-bold text-green-600"
                          : "font-medium text-orange-500"
                  }`}
                >
                  {t(`hint.${hintKey}`, { name: displayUser.name })}
                </span>
              )}
            </div>

            {/* Action buttons — rendered only from the Weave view model */}
            {(currentStatus === "requested" ||
              currentStatus === "approved") && (
              <div className="ml-auto flex shrink-0 gap-[16px] text-megaweave-forest-dark">
                {availableActions.has("approve") && (
                  <button
                    onClick={handleApproveWeave}
                    disabled={isProcessing}
                    className={`transition-all hover:text-green-600 ${isProcessing ? "opacity-50" : ""}`}
                    title={t("actions.approve")}
                    aria-label={t("actions.approve")}
                  >
                    <AcceptIcon className="h-auto w-[18px]" />
                  </button>
                )}
                {availableActions.has("decline") && (
                  <button
                    onClick={handleRejectWeave}
                    disabled={isProcessing}
                    className={`transition-all hover:text-red-600 ${isProcessing ? "opacity-50" : ""}`}
                    title={t("actions.decline")}
                    aria-label={t("actions.decline")}
                  >
                    <CancelIcon className="h-auto w-[18px]" />
                  </button>
                )}
                {availableActions.has("withdraw") && (
                  <button
                    onClick={handleWithdrawWeave}
                    disabled={isProcessing}
                    className={`transition-opacity ${isProcessing ? "opacity-50" : "hover:opacity-70"}`}
                    title={t("actions.withdraw")}
                    aria-label={t("actions.withdraw")}
                  >
                    <CancelIcon className="h-auto w-[18px]" />
                  </button>
                )}
                {currentStatus === "approved" && hasIConfirmed && (
                  <span
                    className="text-green-500"
                    title={t("actions.confirmed")}
                    aria-label={t("actions.confirmed")}
                  >
                    <AcceptIcon className="h-auto w-[18px] stroke-[3px]" />
                  </span>
                )}
                {availableActions.has("confirm") && (
                  <button
                    onClick={handleCompleteWeave}
                    disabled={isProcessing}
                    className={`transition-all ${hasIConfirmed ? "text-green-500" : "text-megaweave-forest-dark"} ${isProcessing ? "opacity-50" : ""}`}
                    title={confirmLabel}
                    aria-label={confirmLabel}
                  >
                    <AcceptIcon
                      className={`h-auto w-[18px] ${hasIConfirmed ? "stroke-[3px]" : ""}`}
                    />
                  </button>
                )}
                {availableActions.has("cancel") && (
                  <button
                    onClick={handleCancelWeave}
                    disabled={isProcessing}
                    className={`transition-opacity ${isProcessing ? "opacity-50" : "hover:opacity-70"}`}
                    title={t("actions.cancel")}
                    aria-label={t("actions.cancel")}
                  >
                    <CancelIcon className="h-auto w-[18px]" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending weave in ChatWindow → show Lalamove quotation below the card */}
      {showQuotation && quotationPost && (
        <LalamoveQuotation post={quotationPost} hasPendingWeave />
      )}
    </>
  );
};

export default WeavingCard;
