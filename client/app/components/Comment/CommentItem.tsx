// components/Comment/CommentItem.tsx
"use client";

import React, { useState } from "react";
import { Comment } from "@/services/commentService";
import CommentInput from "./CommentInput";
import User from "../../types/user";
import Image from "next/image";
import { useRouter } from "next/navigation";

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

  // 格式化時間（相對時間）
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "剛剛";
    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return date.toLocaleDateString("zh-TW", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="py-3">
      <div className="flex gap-3">
        {/* 頭像 - 🔥 添加點擊功能 */}
        <div
          className="flex-shrink-0 w-[40px] h-[40px] relative cursor-pointer hover:opacity-80 transition-opacity"
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
            <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-gray-600 text-sm">
                {comment.username?.charAt(0) || "?"}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* 用戶名與內容 - 🔥 用戶名也可點擊 */}
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAvatarClick}
                className="text-sm font-medium text-gray-900 hover:text-primary transition-colors hover:underline"
              >
                {comment.username || `User ${comment.user_id}`}
              </button>
              <span className="text-xs text-gray-400">
                {formatDate(comment.created_at)}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          </div>

          {/* 操作列：回覆、讚數、回覆數 */}
          <div className="flex items-center gap-4 mt-1 px-1 text-xs text-gray-500">
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="hover:text-primary transition-colors"
            >
              {showReplyInput ? "取消回覆" : "回覆"}
            </button>
            {comment.like_count > 0 && <span>❤️ {comment.like_count}</span>}
            {comment.reply_count > 0 && <span>💬 {comment.reply_count}</span>}
          </div>

          {/* 回覆輸入框 */}
          {showReplyInput && (
            <div className="mt-3">
              <CommentInput
                postId={postId}
                itemId={comment.item_id === null ? "all" : comment.item_id}
                parentId={comment.id}
                user={user}
                placeholder={`回覆 ${comment.username || "User"}...`}
                onSuccess={handleReplySuccess}
                onCancel={() => setShowReplyInput(false)}
                autoFocus
              />
            </div>
          )}

          {/* 子留言（遞迴渲染） */}
          {comment.children && comment.children.length > 0 && (
            <div className="mt-2 ml-2 border-l-2 border-gray-200 pl-3">
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
          )}
        </div>
      </div>
    </div>
  );
};

export default CommentItem;
