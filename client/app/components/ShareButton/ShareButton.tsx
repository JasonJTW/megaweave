"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check, Copy } from "lucide-react";

interface ShareButtonProps {
  content: string;
  label: string;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  showText?: boolean;
  icon?: "share" | "copy";
}

const ShareButton: React.FC<ShareButtonProps> = ({
  content,
  className = "",
  variant = "outline",
  size = "default",
  label = "",
  showText = true,
  icon = "copy",
}) => {
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (isSharing) return; // 防止重複點擊

    setIsSharing(true);

    try {
      // 直接複製連結到剪貼板
      await copyLinkToClipboard();
    } finally {
      setIsSharing(false);
    }
  };

  const copyLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (error) {
      console.error("複製失敗:", error);
    }
  };

  // 根據 icon 類型選擇對應的圖標組件
  const getIconComponent = () => {
    if (shareSuccess) {
      return <Check className="w-4 h-4 text-green-500" />;
    }

    const iconClass = `w-4 h-4 ${isSharing ? "animate-pulse" : ""}`;

    switch (icon) {
      case "copy":
        return <Copy className={iconClass} />;
      case "share":
      default:
        return <Share2 className={iconClass} />;
    }
  };

  const getButtonContent = () => {
    const iconComponent = getIconComponent();

    if (shareSuccess) {
      return (
        <>
          {iconComponent}
          {showText && <span className="ml-2">已複製</span>}
        </>
      );
    }

    if (isSharing) {
      return (
        <>
          {iconComponent}
          {showText && <span className="ml-2">複製中...</span>}
        </>
      );
    }

    return (
      <>
        {iconComponent}
        {showText && <span className="ml-2">{label}</span>}
      </>
    );
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={`${
        showText ? "justify-start" : "justify-center"
      } ${className}`}
      onClick={handleShare}
      disabled={isSharing}
    >
      {getButtonContent()}
    </Button>
  );
};

export default ShareButton;
