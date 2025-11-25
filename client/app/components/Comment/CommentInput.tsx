// components/Comment/CommentInput.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createComment } from "@/services/commentService";
import User from "../../types/user";
import Image from "next/image";

interface CommentInputProps {
  postId: number;
  itemId?: "all" | number; // "all" = All 留言, 數字 = 特定 item
  parentId?: number | null; // 回覆哪則留言
  user: User | null;
  placeholder?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

const CommentInput: React.FC<CommentInputProps> = ({
  postId,
  itemId,
  parentId = null,
  user,
  placeholder = "Write a comment",
  onSuccess,
  onCancel,
  autoFocus = false,
}) => {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // 檢查登入
    if (!user) {
      alert("Please sign in to comment.");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`
      );
      return;
    }

    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createComment({
        post_id: postId,
        item_id: itemId === "all" ? null : itemId ?? null, // "all" 轉成 null
        parent_id: parentId,
        user_id: Number(user.userId),
        content: content.trim(),
        public_id: user.public_id,
      });

      setContent("");
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to submit comment");
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Failed to submit comment");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ctrl/Cmd + Enter 送出
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-3">
        {/* 使用者頭像 */}
        <div
          className={`flex-shrink-0 relative ${
            parentId ? "w-7 h-7" : "w-9 h-9"
          }`}
        >
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.username || "User"}
              fill
              className="rounded-full object-cover"
            />
          ) : (
            <div
              className={`${
                parentId ? "w-7 h-7" : "w-9 h-9"
              } rounded-full bg-gray-300 flex items-center justify-center`}
            >
              <span className="text-gray-600 text-sm">
                {user?.username?.charAt(0) || "?"}
              </span>
            </div>
          )}
        </div>

        {/* 輸入框 */}
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={user ? placeholder : "Please sign in to comment"}
            autoFocus={autoFocus}
            disabled={isSubmitting || !user}
            rows={parentId ? 2 : 3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg 
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed
            resize-none text-sm"
          />
        </div>
      </div>

      {/* 錯誤訊息 */}
      {error && <p className="mt-1 text-sm text-red-500 ml-12">{error}</p>}

      {/* 按鈕 */}
      <div className="mt-2 flex justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800
            disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim() || !user}
          className="px-4 py-1.5 text-sm text-white bg-primary rounded-lg
          hover:bg-primary/90 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting" : "Submit"}
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
