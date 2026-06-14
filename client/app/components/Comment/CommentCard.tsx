// components/Comment/CommentCard.tsx
"use client";

import React from "react";
import MessageIcon from "../icons/MessageIcon";
import { Button } from "@/components/ui/button";
import ExpandIcon from "../icons/ExpandIcon";
// import WeavingIcon from "../icons/WeavingIcon";
import ExpandedIcon from "../icons/ExpandedIcon";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
// import PrivateMessageIcon from "../icons/PrivateMessageIcon";
import WeavingIcon from "../icons/WeavingIcon";
interface CommentCardProps {
  title: string;
  count?: number;
  quantity?: number; // ✅ 新增：剩餘數量 (Optional)
  isOpen?: boolean;
  onToggle?: () => void;
  onWeaving?: () => void;
  onPrivateMessage?: () => void;
}
const CommentCard: React.FC<CommentCardProps> = ({
  title,
  count = 0,
  quantity, // ✅ 解構取出 quantity
  isOpen = false,
  onToggle,
  // onWeaving,
  onPrivateMessage,
}) => {
  // ✅ 新增：控制數量選單的顯示狀態

  // 處理 WeavingIcon 點擊
  // const handleWeavingClick = () => {
  //   // 檢查是否有庫存，如果沒有，則不允許操作
  //   if (quantity !== undefined && quantity <= 0) {
  //     toast.error("Item is out of stock (Left: 00). Cannot initiate request.");
  //     return;
  //   }

  //   if (onWeaving) {
  //     onWeaving(); // 通知父元件開啟 Weaving Input
  //   } else {
  //     // 預設行為（如果沒有傳遞 onWeaving prop）
  //     toast.success("Weaving action triggered (No callback provided).");
  //   }
  // };

  const handlePrivateMessageClick = () => {
    if (onPrivateMessage) {
      onPrivateMessage();
    } else {
      toast.success("Private Message action triggered.");
    }
  };

  return (
    <div
      className={`relative flex min-h-[36px] bg-primary-5 font-ddin px-[17px] py-[6px] items-center justify-between gap-3
      ${
        isOpen
          ? "bg-primary-5 rounded-t-[18px] rounded-b-none"
          : "rounded-[18px]"
      }`}
    >
      {/* 標題區域 */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="font-medium h-auto text-[20px] text-left leading-[1.1]">
          {title}
        </div>

        {/* Quantity Left 標籤 */}
        {quantity !== undefined && (
          <div className="flex-shrink-0 flex items-center justify-center bg-primary-30 h-[22px] px-[8px] rounded-[6px]">
            <span className="text-[13px] font-bold text-[#1a1a1a] tracking-tight whitespace-nowrap">
              Left : {quantity.toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-[10px] items-center flex-shrink-0">
        {/* Private message for weaving button */}
        <Button
          variant="ghost"
          className="px-0 py-0 flex items-center gap-1 hover:bg-transparent"
          onClick={handlePrivateMessageClick}
        >
          <WeavingIcon className="!h-[19px] !w-[19px] text-megaweave-forest-dark" />
        </Button>

        {/* 留言按鈕 + 數量 */}
        <Button
          variant="ghost"
          className="px-0 py-0 flex items-center gap-1 hover:bg-transparent"
          onClick={onToggle}
        >
          <MessageIcon className="!h-[19px] !w-[19px] text-megaweave-forest-dark" />
          {count > 0 && (
            <span className="text-sm text-megaweave-forest-dark">{count}</span>
          )}
        </Button>

        {/* Weaving 按鈕 (現在用於開啟數量選擇器) */}
        {/* <Button
          variant="ghost"
          className="px-0 hover:bg-transparent"
          onClick={handleWeavingClick}
        >
          <WeavingIcon className="!h-[19px] !w-[19px] text-megaweave-forest-dark" />
        </Button> */}

        {/* 展開/收合按鈕 */}
        <Button
          variant="ghost"
          className="px-0 hover:bg-transparent"
          onClick={onToggle}
        >
          <motion.div
            animate={{ rotate: isOpen ? 0 : 180 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 15,
            }}
          >
            {isOpen ? (
              <ExpandedIcon
                className={`!h-[19px] !w-[19px] text-megaweave-forest-dark transition-transform `}
              />
            ) : (
              <ExpandIcon
                className={`!h-[19px] !w-[19px] text-megaweave-forest-dark transition-transform 
              `}
              />
            )}
          </motion.div>
        </Button>
      </div>
    </div>
  );
};

export default CommentCard;
