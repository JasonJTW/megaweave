// components/Comment/WeavingInput.tsx
"use client";

import React, { useState, useRef } from "react";
import User from "../../types/user";
import Image from "next/image";
import UnlockIcon from "../icons/UnlockIcon";
import { Button } from "@/components/ui/button";
import WeavingIcon from "../icons/WeavingIcon";
// ✅ 新增 Shadcn Select 元件
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WeavingInputProps {
  user: User | null;
  type: "item" | "all";
  quantityLeft: number;
  onWeavingSubmit: (quantity: number | "all") => void;
  onCancel: () => void;
}

const MAX_WEAVING_QUANTITY = 20;

const WeavingInput: React.FC<WeavingInputProps> = ({
  user,
  type,
  quantityLeft,
  onWeavingSubmit,
  onCancel,
}) => {
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableQuantities = Array.from(
    { length: Math.min(quantityLeft, MAX_WEAVING_QUANTITY) },
    (_, i) => i + 1
  );

  // 移除了 handleClickOutside 邏輯，因為 Shadcn Select 會自動處理點擊外部關閉

  const handleSubmit = () => {
    if (type === "all") {
      onWeavingSubmit("all");
    } else if (selectedQuantity > 0) {
      onWeavingSubmit(selectedQuantity);
    } else {
      alert("Please select a quantity.");
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative max-w-full mt-3 flex gap-3 py-[2px] items-start"
    >
      {/* 1. Avatar (不變) */}
      <div className="flex-shrink-0 w-[40px] h-[40px] relative">
        {user?.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt={`${user.username}'s avatar` || "User's avatar"}
            fill
            className="rounded-full object-cover"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center">
            <span className="text-gray-600 text-xs">
              {user?.username?.charAt(0) || "?"}
            </span>
          </div>
        )}
      </div>

      {/* 2. 內容區域 */}
      <div className="flex flex-col items-start flex-1 min-w-0">
        {/* 2a. 用戶名 (不變) */}
        <span className="text-[14px] leading-[14px] font-medium text-gray-900 whitespace-nowrap mb-1">
          {user?.username} (me)
        </span>

        {/* 2b. 輸入區塊 */}
        <div className="flex items-center gap-2">
          {/* 左側：想索取 + 圖示 (不變) */}
          <div className="flex items-center bg-white rounded-[20px] h-[40px] px-4 gap-3 shadow-sm">
            <p className="text-[15px] font-medium text-gray-800 whitespace-nowrap">
              Request
            </p>
            <WeavingIcon className="h-5 w-5 text-primary" />
            <UnlockIcon className="w-5 h-5 text-primary" />
          </div>

          {/* 右側：數量選擇器 或 "All" 標籤 */}
          <div className="relative">
            {type === "all" ? (
              // 情況一：顯示 "All" 標籤 (靜態)
              <div className="flex items-center justify-center h-[40px] min-w-[56px] px-3 bg-white border border-gray-300 rounded-[22px] select-none">
                <span className="text-[16px] font-medium text-gray-800">
                  All
                </span>
              </div>
            ) : (
              // ✅ 情況二：Shadcn Select 數量選擇器
              <Select
                value={String(selectedQuantity)}
                onValueChange={(val) => setSelectedQuantity(Number(val))}
              >
                <SelectTrigger
                  // 這裡使用了與你原本 button 幾乎一樣的 CSS
                  className="h-[40px] min-w-[65px] px-[16px] rounded-[22px] bg-white border-gray-300 
                  text-[16px] font-bold text-gray-800 
                  hover:border-gray-400 focus:ring-2 focus:ring-primary/10 data-[state=open]:border-primary"
                >
                  <SelectValue placeholder={selectedQuantity} />
                </SelectTrigger>

                <SelectContent
                  className="max-h-[200px] min-w-[65px] rounded-[12px]"
                  // 加上 align="center" 讓選單對齊 Trigger 中央
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
          </div>
        </div>

        {/* 2c. 操作按鈕 (不變) */}
        <div className="flex gap-2 mt-2 ml-1">
          <Button
            onClick={handleSubmit}
            className="h-[28px] px-4 py-0 bg-primary text-white text-xs rounded-full hover:bg-primary/90"
          >
            Submit
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-[28px] px-3 py-0 text-gray-500 text-xs hover:text-gray-700 hover:bg-transparent"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WeavingInput;
