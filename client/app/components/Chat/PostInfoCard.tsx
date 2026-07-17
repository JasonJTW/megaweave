"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Post } from "@/app/types/schema";
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

const MAX_WEAVING_QUANTITY = 20;

interface PostInfoCardProps {
  post: Post;
  item?: PendingItem | null;
  user?: User | null;
  onWeavingSubmit?: (quantity: number | "all") => void;
}

const PostInfoCard: React.FC<PostInfoCardProps> = ({
  post,
  item,
  onWeavingSubmit,
}) => {
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  // 解析貼文圖片
  const images = post.image_urls ? post.image_urls.split(",") : [];
  const firstImg =
    images.length > 0 && images[0].trim() !== "" ? images[0] : null;

  // 顯示標題
  const displayTitle =
    item && item.title !== "all" ? item.title : `All Items - ${post.title}`;

  // 是否為「索取全部」模式
  const isAllMode = !item || item.title === "all";

  // 取得庫存數量
  const matchedItem = !isAllMode
    ? post.items?.find((i) => Number(i.id) === Number(item?.id))
    : null;
  const quantityLeft = matchedItem?.quantity ?? 0;
  const availableQuantities = Array.from(
    {
      length:
        quantityLeft > 0 ? Math.min(quantityLeft, MAX_WEAVING_QUANTITY) : 1,
    },
    (_, i) => i + 1,
  );

  const handleSubmit = () => {
    if (!onWeavingSubmit) return;
    if (isAllMode) {
      onWeavingSubmit("all");
    } else {
      onWeavingSubmit(selectedQuantity);
    }
  };

  return (
    <div className="flex h-[80px] w-full flex-shrink-0 items-center gap-2 border-b border-primary-30 bg-primary-15 px-3 font-ddin">
      {/* 
        左半邊：使用 w-0 flex-1 min-w-0 組合，
        這能確保長文字標題能自動縮小並套用 truncate 截斷，
        而不會把右側的按鈕和數量選擇器擠出容器之外。
      */}
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
          <div className="line-clamp-2 text-[14px] font-bold leading-tight text-gray-800">
            {displayTitle}
          </div>
          <div className="mt-1 text-[11px] leading-none text-gray-500">
            {!isAllMode ? `Left: ${quantityLeft}` : `Post ID: #${post.id}`}
          </div>
        </div>
      </div>

      {/* 右半邊：數量選擇器與 Request 送出按鈕 */}
      {onWeavingSubmit && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {isAllMode ? (
            <div className="flex h-[34px] select-none items-center justify-center rounded-full border border-gray-300 bg-white px-3">
              <span className="text-[12px] font-bold text-gray-700">All</span>
            </div>
          ) : (
            <Select
              value={String(selectedQuantity)}
              onValueChange={(val) => setSelectedQuantity(Number(val))}
            >
              <SelectTrigger className="h-[34px] min-w-[56px] rounded-full border-gray-300 bg-white px-3 text-[13px] font-bold text-gray-800 hover:border-gray-400 focus:ring-1 focus:ring-primary/10">
                <SelectValue placeholder={selectedQuantity} />
              </SelectTrigger>
              {/* 
                加上 portal-class 確保在 React Portal 中渲染，
                並提高 z-index 避免被 popup 遮擋。
              */}
              <SelectContent
                className="z-[150] max-h-[200px] min-w-[56px] rounded-[10px]"
                position="popper"
                align="center"
              >
                {availableQuantities.map((q) => (
                  <SelectItem
                    key={q}
                    value={String(q)}
                    className="cursor-pointer justify-center text-center font-medium focus:bg-primary/5 focus:text-primary"
                  >
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={handleSubmit}
            className="h-[34px] w-auto flex-shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-bold text-white hover:bg-primary/90"
          >
            {post.type === "wish" ? "Offer" : "Request"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PostInfoCard;
