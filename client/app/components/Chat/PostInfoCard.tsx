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
    <div className="w-full h-[80px] bg-primary-15 font-ddin border-b border-primary-30 flex items-center px-3 gap-2 flex-shrink-0">
      {/* 
        左半邊：使用 w-0 flex-1 min-w-0 組合，
        這能確保長文字標題能自動縮小並套用 truncate 截斷，
        而不會把右側的按鈕和數量選擇器擠出容器之外。
      */}
      <div className="flex items-center gap-2">
        {firstImg ? (
          <Image
            width={48}
            height={48}
            src={firstImg}
            className="aspect-square object-cover rounded-md flex-shrink-0"
            alt={post.title}
          />
        ) : (
          <div className="w-[48px] h-[48px] bg-gray-200 rounded-md flex items-center justify-center text-[9px] text-gray-400 flex-shrink-0">
            No img
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="font-bold text-[14px] text-gray-800 truncate leading-tight">
            {displayTitle}
          </div>
          <div className="text-[11px] text-gray-500 leading-none mt-1">
            {!isAllMode ? `Left: ${quantityLeft}` : `Post ID: #${post.id}`}
          </div>
        </div>
      </div>

      {/* 右半邊：數量選擇器與 Request 送出按鈕 */}
      {onWeavingSubmit && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAllMode ? (
            <div className="flex items-center justify-center h-[34px] px-3 bg-white border border-gray-300 rounded-full select-none">
              <span className="text-[12px] font-bold text-gray-700">All</span>
            </div>
          ) : (
            <Select
              value={String(selectedQuantity)}
              onValueChange={(val) => setSelectedQuantity(Number(val))}
            >
              <SelectTrigger className="h-[34px] min-w-[56px] px-3 rounded-full bg-white border-gray-300 text-[13px] font-bold text-gray-800 hover:border-gray-400 focus:ring-1 focus:ring-primary/10">
                <SelectValue placeholder={selectedQuantity} />
              </SelectTrigger>
              {/* 
                加上 portal-class 確保在 React Portal 中渲染，
                並提高 z-index 避免被 popup 遮擋。
              */}
              <SelectContent
                className="max-h-[200px] min-w-[56px] rounded-[10px] z-[150]"
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
            className="h-[34px] px-3.5 bg-primary text-white text-[13px] font-bold rounded-full hover:bg-primary/90 flex-shrink-0"
          >
            Request
          </Button>
        </div>
      )}
    </div>
  );
};

export default PostInfoCard;
