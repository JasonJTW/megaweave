// components/Comment/CommentCard.tsx
"use client";

import React from "react";
import MessageIcon from "../icons/MessageIcon";
import { Button } from "@/components/ui/button";
import ExpandIcon from "../icons/ExpandIcon";
import WeavingIcon from "../icons/WeavingIcon";

interface CommentCardProps {
  title: string;
  count?: number; // ✅ 新增：留言數量
  isOpen?: boolean; // ✅ 新增：是否展開
  onToggle?: () => void; // ✅ 新增：點擊展開/收合
  onWeaving?: () => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
  title,
  count = 0,
  isOpen = false,
  onToggle,
  onWeaving,
}) => {
  const handleWeavingClick = () => {
    if (onWeaving) {
      onWeaving();
    } else {
      const result = confirm("Weaving ?");
      if (result) {
        alert("Weaving started!");
      } else {
        alert("Weaving cancelled.");
      }
    }
  };

  return (
    <div
      className={`flex h-[36px] bg-primary-5 rounded-[18px] font-ddin px-[17px] py-[4px] items-center justify-between
                  ${isOpen ? "bg-primary-10" : ""}`}
    >
      <div className="font-medium text-[21px] text-center">{title}</div>

      <div className="flex gap-[10px] items-center">
        {/* 留言按鈕 + 數量 */}
        <Button
          variant="ghost"
          className="px-0 py-0 flex items-center gap-1"
          onClick={onToggle}
        >
          <MessageIcon className="!h-[19px] !w-[19px]" />
          {count > 0 && <span className="text-sm text-gray-600">{count}</span>}
        </Button>

        {/* Weaving 按鈕 */}
        <Button variant="ghost" className="px-0" onClick={handleWeavingClick}>
          <WeavingIcon className="!h-[19px] !w-[19px]" />
        </Button>

        {/* 展開/收合按鈕 */}
        <Button variant="ghost" className="px-0" onClick={onToggle}>
          <ExpandIcon
            className={`!h-[19px] !w-[19px] transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </Button>
      </div>
    </div>
  );
};

export default CommentCard;
