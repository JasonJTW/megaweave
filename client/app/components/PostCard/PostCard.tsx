// PostCard.tsx 重點改寫
"use client";
import React, { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { User as UserIcon } from "lucide-react";
import type { Post, Condition, Category } from "../../types/schema";
import { Badge } from "@/components/ui/badge";
import LocationIcon from "../icons/LocationIcon";
import ClockIcon from "../icons/ClockIcon";
import EyesIcon from "../icons/EyesIcon";
import ShareBadgeIcon from "../icons/ShareBadgeIcon";
import type { Weave } from "@/services/weaveService";
import AcceptIcon from "../icons/AcceptIcon";
import CancelIcon from "../icons/CancelIcon";
import SeekBadgeIcon from "../icons/WishBadgeIcon";
import toast from "react-hot-toast";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  categories: Category[];
  onPostClick: (post: Post) => void;
  isExpanded?: boolean;
  isActive?: boolean;
  weave?: Weave;
  currentUserId?: number;
  onWeaveStatusChange?: () => void; // ✅ 新增：狀態改變後的回調
  onCategoryClick?: (categoryId: number) => void;
  onLocationClick?: (
    type: "province" | "city" | "route",
    value: string,
  ) => void;
}

function PostCardInner({
  post,
  // conditions,
  categories,
  onPostClick,
  isExpanded = false,
  weave,
  currentUserId,
  onWeaveStatusChange,
  onCategoryClick,
  onLocationClick,
}: PostCardProps) {
  // const condition = conditions.find((c) => c.level === post.condition_level);

  const category = categories.find((c) => c.id === post.category_id);

  const [isProcessing, setIsProcessing] = useState(false);
  const [localWeaveStatus, setLocalWeaveStatus] = useState(weave?.status);

  // ✅ 新增：追蹤雙方的確認狀態
  const [localGiverConfirmed, setLocalGiverConfirmed] = useState(
    !!weave?.giver_confirmed,
  );
  const [localReceiverConfirmed, setLocalReceiverConfirmed] = useState(
    !!weave?.receiver_confirmed,
  );

  // 判斷當前使用者角色與是否已確認
  const isGiver = currentUserId === weave?.giver_id;
  const isReceiver = currentUserId === weave?.receiver_id;
  const hasIConfirmed = isGiver ? localGiverConfirmed : localReceiverConfirmed;
  const hasOtherConfirmed = isGiver
    ? localReceiverConfirmed
    : localGiverConfirmed;

  const imageUrls = Array.isArray(post.image_urls)
    ? post.image_urls
    : typeof post.image_urls === "string"
      ? post.image_urls.split(",")
      : [];

  const imageSrc = imageUrls[0];

  const displayUser =
    weave && currentUserId
      ? currentUserId === weave.giver_id
        ? {
            name: weave.receiver_name,
            avatar: weave.receiver_avatar,
            role: "Receiver",
          }
        : {
            name: weave.giver_name,
            avatar: weave.giver_avatar,
            role: "Giver",
          }
      : null;

  // ✅ 完成交易
  const handleCompleteWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing || hasIConfirmed) return;

    if (!isGiver && !isReceiver) {
      toast.error("You are not authorized to complete this weave");
      return;
    }

    const confirmMessage = isReceiver
      ? "Have you physically received the item? This action cannot be undone once both parties confirm."
      : "Have you handed over or shipped the item? The transaction will close once the receiver also confirms.";

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "completed" }),
        },
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to update");

      // ✅ 根據後端 newStatus 判斷是否全案完成
      if (data.newStatus === "completed") {
        setLocalWeaveStatus("completed");
        setLocalGiverConfirmed(true);
        setLocalReceiverConfirmed(true);
        toast.success("Transaction fully completed!");
      } else {
        // 僅單方面確認成功
        if (isGiver) setLocalGiverConfirmed(true);
        if (isReceiver) setLocalReceiverConfirmed(true);
        toast.success(
          "Your confirmation received. Waiting for the other party.",
        );
      }

      if (onWeaveStatusChange) onWeaveStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  // ✅ 取消交易
  const handleCancelWeave = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 防止觸發 onPostClick

    if (!weave || isProcessing) return;

    // 權限檢查：giver 和 receiver 都可以取消
    if (
      currentUserId !== weave.giver_id &&
      currentUserId !== weave.receiver_id
    ) {
      toast.error("You are not authorized to cancel this weave");
      return;
    }

    if (weave.status !== "pending") {
      toast.error(`Weave is already ${weave.status}`);
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this weave?",
    );
    if (!confirmed) return;

    setIsProcessing(true);

    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ status: "cancelled" }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errorMessage || "Failed to cancel weave");
      }

      // 更新本地狀態
      setLocalWeaveStatus("cancelled");
      toast.success("Weave cancelled successfully!");

      // 通知父組件刷新數據
      if (onWeaveStatusChange) {
        onWeaveStatusChange();
      }
    } catch (error) {
      console.error("Error cancelling weave:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel weave",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // 使用本地狀態或 weave 狀態
  const currentStatus = localWeaveStatus || weave?.status;

  return (
    <div
      onClick={() => onPostClick(post)}
      className={`font-ddin cursor-pointer rounded-[30px] bg-white  transition-all duration-300 py-0 pb-4 mt-4 relative ${
        isExpanded ? "postcard-expanded" : "postcard-collapsed"
      }`}
      style={
        {
          "--post-title-h": "12px",
        } as React.CSSProperties & Record<string, string>
      }
    >
      {/* ✅ Weave 狀態標籤 (移到標題右側) */}
      {weave && (
        <div
          className="flex items-center  px-4 pt-6 pb-2"
          style={{
            height: "var(--post-title-h, 72px)",
            minHeight: "var(--post-title-h, 72px)",
          }}
        >
          <Badge
            className={`${
              currentStatus === "completed"
                ? "bg-green-500"
                : currentStatus === "cancelled"
                  ? "bg-red-500"
                  : "bg-yellow-500"
            } text-white font-bold `}
          >
            {currentStatus === "completed"
              ? "Completed"
              : currentStatus === "cancelled"
                ? "Cancelled"
                : hasIConfirmed
                  ? "Waiting for other"
                  : "Pending"}
          </Badge>
        </div>
      )}

      {/*//* pt-3 for title margin */}
      <div className="relative pt-3">
        {post.type === "share" && (
          <ShareBadgeIcon className="absolute -top-1 right-5 z-20" />
        )}
        {post.type === "wish" && (
          <SeekBadgeIcon className="absolute -top-1 right-5 z-20" />
        )}

        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={
            isExpanded ? { y: 0, maxHeight: 5000 } : { y: 0, maxHeight: 0 }
          }
          transition={{ duration: 0.6, ease: "easeIn" }}
          style={{ pointerEvents: isExpanded ? "auto" : "none" }}
        >
          {imageSrc && (
            //* mx-3 for image margin
            <div className="relative justify-center mb-0 mx-3">
              <div className="relative w-full rounded-[20px] overflow-hidden">
                <Image
                  src={imageSrc}
                  alt={post.title}
                  width={0}
                  height={0}
                  sizes="100vw"
                  style={{ width: "100%", height: "auto" }}
                  className="object-cover"
                  priority={false}
                />
              </div>

              <div className="absolute w-full flex flex-row bottom-0 justify-between px-3 py-3">
                {post.view_count > 0 && (
                  <div className="flex items-center">
                    <Badge className="bg-[#7c7c7c] text-white font-ddin font-normal text-[14px] px-2">
                      <EyesIcon className="mr-[4px]" />
                      {post.view_count}
                    </Badge>
                  </div>
                )}
                {/* {condition && (
                  <div className="flex items-center">
                    <Badge>{condition.name}</Badge>
                  </div>
                )} */}
              </div>
            </div>
          )}
          <h2 className="font-semibold mx-3 font-ddin text-[36px] text-gray-800 truncate flex-1">
            {post.title}
          </h2>

          {(category || post.category_name_en) && (
            <div
              className="inline-flex mx-3 mt-[8px] leading-[34px] cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onCategoryClick) {
                  onCategoryClick(post.category_id);
                }
              }}
            >
              <Badge className="h-[34px] transition-colors">
                {category?.name_en || post.category_name_en}
              </Badge>
            </div>
          )}

          <div className="bg-white flex flex-col p-3 mx-0 rounded-[20px]">
            <p className="text-black text-[18px] truncate">{post.content}</p>

            {/* ✅ 顯示 Weave 備註 */}
            {weave?.notes && (
              <div className="mb-[10px] p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 font-semibold mb-1">
                  Notes:
                </p>
                <p className="text-sm text-gray-800">{weave.notes}</p>
              </div>
            )}

            {/* <div className="min-h-[18px]">
              {post.tags && (
                <div className="flex flex-wrap gap-0 leading-[18px]">
                  {post.tags.split(",").map((tag, i) => (
                    <div
                      key={i}
                      className="flex items-center bg-secondary rounded-[10pt] px-[8px] py-[5px]"
                    >
                      <span className="text-[16px] text-megaweave-forest-dark px-2 font-medium font-ddin tracking-wider">
                        #{tag.trim()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div> */}

            <div className="flex flex-col gap-[6px] mt-[12px] text-[16px] font-medium leading-[18px]">
              {(post.province ||
                post.city ||
                post.route ||
                post.full_address) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <LocationIcon className="text-primary flex-shrink-0" />
                  <span className="text-[16px] text-gray-700">
                    {post.province && (
                      <span
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("province", post.province!);
                        }}
                      >
                        {post.province}
                      </span>
                    )}
                    {post.province && (post.city || post.route) && ", "}
                    {post.city && (
                      <span
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("city", post.city!);
                        }}
                      >
                        {post.city}
                      </span>
                    )}
                    {post.city && post.route && ", "}
                    {post.route && (
                      <span
                        className="cursor-pointer hover:underline hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onLocationClick)
                            onLocationClick("route", post.route!);
                        }}
                      >
                        {post.route}
                      </span>
                    )}
                    {!post.province &&
                      !post.city &&
                      !post.route &&
                      post.full_address && <span>{post.full_address}</span>}
                  </span>
                </div>
              )}
              {post.created_at && (
                <div className="flex items-center gap-2">
                  <ClockIcon className="text-primary" />
                  {new Date(post.created_at).toLocaleDateString()}
                </div>
              )}

              {/* ✅ 顯示 Weave 完成時間 */}
              {weave?.completed_at && (
                <div className="flex items-center gap-2 text-green-600">
                  <ClockIcon className="text-green-600" />
                  Completed: {new Date(weave.completed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* ✅ 顯示 Weave 用戶資訊和操作按鈕 */}
          {displayUser && (
            <div className="bg-primary-5 min-h-[60px] rounded-[20px] px-[16px] py-[12px] flex items-center gap-2 text-gray-600 text-sm mx-4 mt-4">
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

              <div className="flex flex-col flex-1">
                <span className="text-[#222] type-body-t4 font-semibold">
                  {displayUser.name}
                </span>
                <span className="text-[#666] type-body-t5">
                  {displayUser.role}
                </span>
                {/* ✅ 強化後的提示訊息 */}
                {currentStatus === "pending" && (
                  <div className="mt-1 flex flex-col gap-1">
                    {!hasIConfirmed ? (
                      // 使用者尚未點擊 Complete
                      <span className="text-orange-500 text-xs font-medium">
                        {isReceiver
                          ? "Received the item? Click the checkmark to confirm."
                          : "Handed over the item? Click the checkmark to confirm."}
                      </span>
                    ) : !hasOtherConfirmed ? (
                      // 使用者已點擊，正在等對方
                      <span className="text-blue-600 text-xs mt-1 animate-pulse">
                        {isReceiver
                          ? `Received confirmed. Waiting for ${displayUser.name} to confirm handover...`
                          : `Handover confirmed. Waiting for ${displayUser.name} to confirm receipt...`}
                      </span>
                    ) : null}

                    {/* 對方已經點了，提醒我快點點 */}
                    {!hasIConfirmed && hasOtherConfirmed && (
                      <span className="text-green-600 text-xs font-bold">
                        {isReceiver
                          ? `${displayUser.name} confirmed handover. Please confirm receipt!`
                          : `${displayUser.name} confirmed receipt. Please confirm handover!`}
                      </span>
                    )}
                  </div>
                )}
                {/* {weave && (
                  <span className="text-[#222] type-body-t5 mt-1">
                    {currentUserId === weave.receiver_id
                      ? `You requested ${weave.item_title || "item"} × ${
                          weave.quantity
                        }`
                      : `They requested ${weave.item_title || "item"} × ${
                          weave.quantity
                        }`}
                  </span>
                )} */}
              </div>

              {/* ✅ 操作按鈕 - 只在 pending 狀態顯示 */}
              {currentStatus === "pending" && (
                <div className="text-megaweave-forest-dark flex gap-[16px] ml-auto">
                  {/* ✅ Complete 按鈕 - giver 和 receiver 都可以看到 */}
                  <button
                    onClick={handleCompleteWeave}
                    disabled={isProcessing || hasIConfirmed}
                    className={`transition-all ${
                      hasIConfirmed
                        ? "text-green-500"
                        : "text-megaweave-forest-dark "
                    } ${isProcessing ? "opacity-50" : ""}`}
                    title={
                      hasIConfirmed ? "You have confirmed" : "Complete weave"
                    }
                  >
                    <AcceptIcon
                      className={`w-[18px] h-auto ${
                        hasIConfirmed ? "stroke-[3px]" : ""
                      }`}
                    />
                  </button>

                  {/* Cancel 按鈕 - giver 和 receiver 都可以看到 */}
                  <button
                    onClick={handleCancelWeave}
                    disabled={isProcessing}
                    className={`transition-opacity ${
                      isProcessing ? "opacity-50" : "hover:opacity-70"
                    }`}
                    title="Cancel weave"
                  >
                    <CancelIcon className="w-[18px] h-auto" />
                  </button>
                </div>
              )}

              {/* 最終狀態提示 */}
              {currentStatus !== "pending" && (
                <div className="ml-auto">
                  <span
                    className={`text-sm font-semibold ${
                      currentStatus === "completed"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {currentStatus === "completed"
                      ? "✓ Completed"
                      : "✗ Cancelled"}
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default React.memo(PostCardInner, (prev, next) => {
  return (
    prev.isExpanded === next.isExpanded &&
    prev.post.id === next.post.id &&
    prev.weave?.status === next.weave?.status &&
    prev.weave?.giver_confirmed === next.weave?.giver_confirmed &&
    prev.weave?.receiver_confirmed === next.weave?.receiver_confirmed
  );
});
