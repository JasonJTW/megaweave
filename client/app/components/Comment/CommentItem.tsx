// components/Comment/CommentItem.tsx
"use client";

import React, { useState } from "react";
import { Comment } from "@/services/commentService";
import CommentInput from "./CommentInput";
import User from "../../types/user";
import Image from "next/image";
import { useRouter } from "next/navigation";
import UnlockIcon from "../icons/UnlockIcon";
import MessageIcon from "../icons/MessageIcon";

interface CommentItemProps {
  comment: Comment;
  postId: number;
  user: User | null;
  onReplySuccess?: () => void;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  postId,
  user,
  onReplySuccess,
}) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const router = useRouter();

  // 回覆成功後
  const handleReplySuccess = () => {
    setShowReplyInput(false);
    onReplySuccess?.(); // 通知父元件重新載入留言
  };

  // 🔥 新增：點擊頭像前往 profile 頁面
  const handleAvatarClick = () => {
    if (comment.public_id) {
      router.push(`/profile/${comment.public_id}`);
    } else {
      console.warn("User public_id not available");
    }
  };

  // console.log("資料庫時間:", comment.created_at);
  // console.log("解析後:", new Date(comment.created_at));
  // console.log("現在時間:", new Date());
  // console.log(
  //   "時間差(分鐘):",
  //   Math.floor(
  //     (new Date().getTime() - new Date(comment.created_at).getTime()) / 60000
  //   )
  // );

  // 格式化時間（相對時間）
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hrs ago`;
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    // 移除 `py-3`，讓外部容器控制間距
    <div id={`comment-${comment.id}`} className="relative mt-3 max-w-full">
      <div className="flex items-start gap-2 px-0 py-[2px]">
        {/* avatar*/}
        <div
          className="relative mt-[8px] h-[36px] w-[36px] flex-shrink-0 cursor-pointer transition-opacity hover:opacity-80" // 調整大小和 mt 讓其與文字頂部對齊
          onClick={handleAvatarClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleAvatarClick();
            }
          }}
        >
          {comment.avatar_url ? (
            <Image
              src={comment.avatar_url}
              alt={`${comment.username}'s avatar` || "User's avatar"}
              fill
              className="rounded-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-300">
              <span className="text-xs text-gray-600">
                {comment.username?.charAt(0) || "?"}
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start">
          <button
            onClick={handleAvatarClick}
            className="whitespace-nowrap text-[14px] font-medium leading-[14px] text-gray-900 transition-colors hover:text-primary hover:underline" // 保持用戶名不換行
          >
            {comment.username || `User ${comment.public_id}`}
          </button>
          <div className="mt-1 flex min-h-[32px] w-full items-center justify-between rounded-[16px] bg-white pl-3 pr-2">
            {" "}
            {/* 使用 bg-gray-50 模擬氣泡背景 */}
            {/* 留言內容 */}
            <p className="mx-2 overflow-hidden text-ellipsis whitespace-pre-line break-words break-all py-2 text-sm text-gray-700">
              {comment.content}
            </p>
            {/* 🔥 問題 2 修正點：鎖頭和時間 */}
            <div className="flex flex-shrink-0 items-center">
              {/* 鎖頭圖標：我們把它放在 P 標籤後面，但仍位於氣泡容器內 */}
              {comment.is_private === undefined && (
                <UnlockIcon className="h-4 w-4 text-gray-400" />
              )}{" "}
              {/* 假設 is_private 決定是否顯示 */}
              {/* 時間：在設計稿 2 中，時間是在氣泡外的，但在您的程式碼中是在氣泡內。我們遵循設計稿 2 的氣泡外顯示。
                 --> **將時間移動到氣泡外部，在操作列附近顯示**。
              */}
            </div>
          </div>
        </div>
      </div>
      {/* 操作列和回覆輸入框的樣式調整，使其更緊湊 */}
      <div className="ml-[32px] mt-[2px] flex items-center gap-4 text-xs text-gray-500">
        {" "}
        {/* 調整 ml 以對齊內容 */}
        {/* 回覆按鈕 */}
        <button
          onClick={() => setShowReplyInput(!showReplyInput)}
          className="transition-colors hover:text-primary"
        >
          {showReplyInput ? "cancel" : "reply"}
        </button>
        <span className="text-xs text-gray-400">
          {formatDate(comment.created_at)}
        </span>
        {/* 其他操作按鈕，如讚數和回覆數，可以考慮是否在此處顯示或放在其他位置 */}
        {comment.like_count > 0 && <span>❤️ {comment.like_count}</span>}
        {comment.reply_count > 0 && (
          <div className="flex gap-1">
            <MessageIcon className="w-4" /> {comment.reply_count}
          </div>
        )}
      </div>
      {/* 回覆輸入框 */}
      {showReplyInput && (
        <div className="ml-[32px] mt-2">
          {" "}
          {/* 調整 ml 以對齊內容 */}
          <CommentInput
            postId={postId}
            itemId={comment.item_id === null ? "all" : comment.item_id}
            parentId={comment.id}
            user={user}
            placeholder={`Reply ${comment.username || "User"}...`}
            onSuccess={handleReplySuccess}
            onCancel={() => setShowReplyInput(false)}
            autoFocus
          />
        </div>
      )}
      {/* 子留言（遞迴渲染） - 調整線條樣式和位置 */}
      {comment.children && comment.children.length > 0 && (
        // 子留言的縮進和線條
        <div className="relative ml-4 mt-2">
          <div className="absolute bottom-0 left-[15px] top-0 w-[1px] bg-gray-300"></div>
          <div className="pl-6">
            {comment.children.map((child) => (
              <CommentItem
                key={child.id}
                comment={child}
                postId={postId}
                user={user}
                onReplySuccess={onReplySuccess}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentItem;
