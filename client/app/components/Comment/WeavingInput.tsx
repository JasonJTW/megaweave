// components/Comment/WeavingInput.tsx
// Need to be reviewed, probobly its a unused file
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
import toast from "react-hot-toast";

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
    (_, i) => i + 1,
  );

  // 移除了 handleClickOutside 邏輯，因為 Shadcn Select 會自動處理點擊外部關閉

  const handleSubmit = () => {
    if (type === "all") {
      onWeavingSubmit("all");
    } else if (selectedQuantity > 0) {
      onWeavingSubmit(selectedQuantity);
    } else {
      toast.error("Please select a quantity.");
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative mt-3 flex max-w-full items-start gap-3 py-[2px]"
    >
      {/* 1. Avatar (不變) */}
      <div className="relative h-[40px] w-[40px] flex-shrink-0">
        {user?.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt={`${user.username}'s avatar` || "User's avatar"}
            fill
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-300">
            <span className="text-xs text-gray-600">
              {user?.username?.charAt(0) || "?"}
            </span>
          </div>
        )}
      </div>

      {/* 2. 內容區域 */}
      <div className="flex min-w-0 flex-1 flex-col items-start">
        {/* 2a. 用戶名 (不變) */}
        <span className="mb-1 whitespace-nowrap text-[14px] font-medium leading-[14px] text-gray-900">
          {user?.username} (me)
        </span>

        {/* 2b. 輸入區塊 */}
        <div className="flex items-center gap-2">
          {/* 左側：想索取 + 圖示 (不變) */}
          <div className="flex h-[40px] items-center gap-3 rounded-[20px] bg-white px-4 shadow-sm">
            <p className="whitespace-nowrap text-[15px] font-medium text-gray-800">
              Request
            </p>
            <WeavingIcon className="h-5 w-5 text-primary" />
            <UnlockIcon className="h-5 w-5 text-primary" />
          </div>

          {/* 右側：數量選擇器 或 "All" 標籤 */}
          <div className="relative">
            {type === "all" ? (
              // 情況一：顯示 "All" 標籤 (靜態)
              <div className="flex h-[40px] min-w-[56px] select-none items-center justify-center rounded-[22px] border border-gray-300 bg-white px-3">
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
                  className="h-[40px] min-w-[65px] rounded-[22px] border-gray-300 bg-white px-[16px] text-[16px] font-bold text-gray-800 hover:border-gray-400 focus:ring-2 focus:ring-primary/10 data-[state=open]:border-primary"
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
        <div className="ml-1 mt-2 flex gap-2">
          <Button
            onClick={handleSubmit}
            className="h-[28px] rounded-full bg-primary px-4 py-0 text-xs text-white hover:bg-primary/90"
          >
            Submit
          </Button>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="h-[28px] px-3 py-0 text-xs text-gray-500 hover:bg-transparent hover:text-gray-700"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WeavingInput;
