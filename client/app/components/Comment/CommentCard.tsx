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

  const handleWeavingMessageClick = () => {
    if (onPrivateMessage) {
      onPrivateMessage();
    } else {
      toast.success("Weaving Message action triggered.");
    }
  };

  return (
    <div
      className={`relative flex min-h-[36px] items-center justify-between gap-3 bg-primary-5 px-[17px] py-[6px] font-ddin ${
        isOpen
          ? "rounded-b-none rounded-t-[18px] bg-primary-5"
          : "rounded-[18px]"
      }`}
    >
      {/* 標題區域 */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-auto text-left text-[20px] font-medium leading-[1.1]">
          {title}
        </div>

        {/* Quantity Left 標籤 */}
        {quantity !== undefined && (
          <div className="flex h-[22px] flex-shrink-0 items-center justify-center rounded-[6px] bg-primary-30 px-[8px]">
            <span className="whitespace-nowrap text-[13px] font-bold tracking-tight text-[#1a1a1a]">
              Left : {quantity.toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-[10px]">
        {/* Private message for weaving button */}
        <Button
          variant="ghost"
          className={`flex items-center gap-1 px-0 py-0 hover:bg-transparent ${title == "All" || (quantity && quantity > 0) ? "" : "hidden"}`}
          onClick={handleWeavingMessageClick}
        >
          <WeavingIcon className="!h-[19px] !w-[19px] text-megaweave-forest-dark" />
        </Button>

        {/* 留言按鈕 + 數量 */}
        <Button
          variant="ghost"
          className="flex items-center gap-1 px-0 py-0 hover:bg-transparent"
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
                className={`!h-[19px] !w-[19px] text-megaweave-forest-dark transition-transform`}
              />
            ) : (
              <ExpandIcon
                className={`!h-[19px] !w-[19px] text-megaweave-forest-dark transition-transform`}
              />
            )}
          </motion.div>
        </Button>
      </div>
    </div>
  );
};

export default CommentCard;
