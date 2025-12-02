// components/Comment/WeavingInput.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import User from "../../types/user";
import Image from "next/image";
import UnlockIcon from "../icons/UnlockIcon";
import { Button } from "@/components/ui/button";
import WeavingIcon from "../icons/WeavingIcon";

interface WeavingInputProps {
  user: User | null;
  quantityLeft: number; // 剩餘庫存
  onWeavingSubmit: (quantity: number) => void; // 提交索取請求
  onCancel: () => void; // 取消/隱藏
}

const MAX_WEAVING_QUANTITY = 3;

const WeavingInput: React.FC<WeavingInputProps> = ({
  user,
  quantityLeft,
  onWeavingSubmit,
  onCancel,
}) => {
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [showSelector, setShowSelector] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableQuantities = Array.from(
    { length: Math.min(quantityLeft, MAX_WEAVING_QUANTITY) },
    (_, i) => i + 1
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSubmit = () => {
    if (selectedQuantity > 0) {
      onWeavingSubmit(selectedQuantity);
    } else {
      alert("Please select a quantity.");
    }
  };

  const handleQuantitySelect = (q: number) => {
    setSelectedQuantity(q);
    setShowSelector(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative max-w-full mt-3 flex gap-3 py-[2px] items-start"
    >
      {/* 1. Avatar */}
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
        {/* 2a. 用戶名 */}
        <span className="text-[14px] leading-[14px] font-medium text-gray-900 whitespace-nowrap mb-1">
          {user?.username || "moori"} (me)
        </span>

        {/* 2b. 輸入區塊 (分為左側氣泡與右側數量選擇) */}
        <div className="flex items-center gap-2">
          {/* 左側：想索取 + 圖示 */}
          <div className="flex items-center bg-white rounded-[20px] h-[40px] px-4 gap-3 shadow-sm">
            <p className="text-[15px] font-medium text-gray-800 whitespace-nowrap">
              想索取
            </p>
            {/* 圖示顏色調整為深綠色以符合設計稿 */}
            <WeavingIcon className="h-5 w-5 text-[#3F4F3F]" />
            <UnlockIcon className="w-5 h-5 text-[#3F4F3F]" />
          </div>

          {/* 右側：數量選擇器 (獨立的圓角方塊) */}
          <div className="relative">
            <button
              className={`flex items-center justify-between h-[40px] min-w-[56px] px-3 bg-white border rounded-[16px] transition-all duration-200
                ${
                  showSelector
                    ? "border-primary ring-2 ring-primary/10"
                    : "border-gray-300 hover:border-gray-400"
                }
              `}
              onClick={(e) => {
                e.stopPropagation();
                setShowSelector(!showSelector);
              }}
            >
              <span className="text-[16px] font-bold text-gray-800">
                {selectedQuantity}
              </span>
              <svg
                className={`w-4 h-4 text-gray-800 ml-1 transition-transform duration-200 ${
                  showSelector ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5" // 加粗箭頭
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* 下拉選單 */}
            {showSelector && availableQuantities.length > 0 && (
              <div className="absolute top-[44px] left-0 w-full bg-white shadow-xl rounded-[12px] border border-gray-200 overflow-hidden z-50 flex flex-col items-center py-1">
                {availableQuantities.map((q) => (
                  <div
                    key={q}
                    className={`w-full py-1.5 text-sm text-center cursor-pointer hover:bg-gray-100
                      ${
                        q === selectedQuantity
                          ? "font-bold text-primary bg-primary/5"
                          : "text-gray-700"
                      }
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuantitySelect(q);
                    }}
                  >
                    {q}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2c. 操作按鈕 (Submit / Cancel) */}
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
