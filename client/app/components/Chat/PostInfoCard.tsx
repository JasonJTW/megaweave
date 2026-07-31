"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Post } from "@/app/types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { PendingItem } from "@/app/contexts/ChatPopupContext";
import User from "@/app/types/user";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";

const MAX_WEAVING_QUANTITY = 20;

export interface SelectedWeaveItem {
  itemId: number;
  quantity: number;
  title: string;
}

interface PostInfoCardProps {
  post: Post;
  item?: PendingItem | null;
  user?: User | null;
  onWeavingSubmit?: (items: SelectedWeaveItem[]) => void;
}

const PostInfoCard: React.FC<PostInfoCardProps> = ({
  post,
  item,
  onWeavingSubmit,
}) => {
  const [selectedQuantities, setSelectedQuantities] = useState<
    Record<number, number>
  >(() => {
    // 預設將傳入的 pendingItem 勾選數量 1
    const initial: Record<number, number> = {};
    if (item && item.id !== "all") {
      initial[Number(item.id)] = 1;
    } else if (post.items && post.items.length > 0) {
      // 若為 all 或無特定 item，預設全選或選第一個
      post.items.forEach((it) => {
        initial[it.id] = 1;
      });
    }
    return initial;
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const s3Keys = parseS3Keys(post);
  const firstKey = s3Keys[0];
  const firstImg = firstKey
    ? firstKey.startsWith("http")
      ? firstKey
      : getImageUrl(firstKey, "thumb")
    : null;

  const postItems = post.items || [];
  const hasMultipleItems = postItems.length > 1;

  const handleToggleItem = (itemId: number) => {
    setSelectedQuantities((prev) => {
      const next = { ...prev };
      if (next[itemId]) {
        delete next[itemId];
      } else {
        next[itemId] = 1;
      }
      return next;
    });
  };

  const handleQuantityChange = (itemId: number, qty: number) => {
    setSelectedQuantities((prev) => ({
      ...prev,
      [itemId]: qty,
    }));
  };

  const selectedCount = Object.keys(selectedQuantities).length;

  const handleSubmit = () => {
    if (!onWeavingSubmit) return;
    const resultItems: SelectedWeaveItem[] = Object.entries(
      selectedQuantities,
    ).map(([itemIdStr, qty]) => {
      const id = Number(itemIdStr);
      const matched = postItems.find((i) => i.id === id);
      return {
        itemId: id,
        quantity: qty,
        title: matched?.title || "Item",
      };
    });
    onWeavingSubmit(resultItems);
  };

  return (
    <div className="flex w-full flex-shrink-0 flex-col border-b border-primary-30 bg-primary-15 font-ddin transition-all">
      {/* 上半部：主貼文縮圖與標題資訊 */}
      <div className="flex h-[80px] w-full items-center gap-2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {firstImg ? (
            <Image
              width={48}
              height={48}
              src={firstImg}
              className="aspect-square flex-shrink-0 rounded-md object-cover"
              alt={post.title}
            />
          ) : (
            <div className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-md bg-gray-200 text-[9px] text-gray-400">
              No img
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-[14px] font-bold leading-tight text-gray-800">
              {post.title}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] leading-none text-gray-500">
              <span>Selected: {selectedCount} items</span>
              {hasMultipleItems && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-0.5 font-bold text-primary hover:underline"
                >
                  {isExpanded ? (
                    <>
                      Hide items <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Choose items ({postItems.length}){" "}
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 右側：動作按鈕 */}
        {onWeavingSubmit && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={selectedCount === 0}
              className="h-[34px] w-auto flex-shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {post.type === "wish" ? "Offer" : "Request"} ({selectedCount})
            </Button>
          </div>
        )}
      </div>

      {/* 下半部 (只在點擊 Choose items 展開時才顯示)：包含該 Post 下所有 Items 勾選與數量選單 */}
      {isExpanded && postItems.length > 0 && (
        <div className="flex max-h-[160px] flex-col gap-1.5 overflow-y-auto border-t border-primary-30/40 bg-white/80 px-3 py-2">
          {postItems.map((it) => {
            const isChecked = Boolean(selectedQuantities[it.id]);
            const currentQty = selectedQuantities[it.id] || 1;
            const quantityLeft = it.quantity ?? 1;
            const availableQuantities = Array.from(
              {
                length:
                  quantityLeft > 0
                    ? Math.min(quantityLeft, MAX_WEAVING_QUANTITY)
                    : 1,
              },
              (_, i) => i + 1,
            );

            return (
              <div
                key={it.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                  isChecked
                    ? "border border-primary/20 bg-primary/10"
                    : "border border-gray-100 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleItem(it.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="truncate text-[13px] font-semibold text-gray-800">
                    {it.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    (Left: {it.quantity})
                  </span>
                </label>

                {isChecked && (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] font-medium text-gray-500">
                      Qty:
                    </span>
                    <Select
                      value={String(currentQty)}
                      onValueChange={(val) =>
                        handleQuantityChange(it.id, Number(val))
                      }
                    >
                      <SelectTrigger className="h-[26px] w-[54px] rounded-md border-gray-300 bg-white px-2 py-0 text-[12px] font-bold text-gray-800 focus:ring-primary/20">
                        <SelectValue placeholder={currentQty} />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[200] max-h-[160px] w-[54px] min-w-[54px] rounded-[10px] bg-white p-0 shadow-lg"
                        position="popper"
                        align="end"
                      >
                        {availableQuantities.map((q) => (
                          <SelectItem
                            key={q}
                            value={String(q)}
                            className="cursor-pointer justify-center px-1 py-1 text-center text-[13px] font-medium text-gray-800 focus:bg-primary-15"
                          >
                            {q}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PostInfoCard;
