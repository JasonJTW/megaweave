// components/Comment/CommentInput.tsx
"use client";
import { useRouter } from "@/i18n/navigation";

import React, { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { createComment } from "@/services/commentService";
import User from "../../types/user";
import Image from "next/image";
import toast from "react-hot-toast";
interface CommentInputProps {
  postId: number;
  itemId?: "all" | number; // "all" = All 留言, 數字 = 特定 item
  parentId?: number | null; // 回覆哪則留言
  user: User | null;
  /** Defaults to the generic "write a comment" prompt */
  placeholder?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

const MAX_CHARACTER_LIMIT = 200; // comment words limit

const CommentInput: React.FC<CommentInputProps> = ({
  postId,
  itemId,
  parentId = null,
  user,
  placeholder,
  onSuccess,
  onCancel,
  autoFocus = false,
}) => {
  const router = useRouter();
  const t = useTranslations("Comments");
  const formatter = useFormatter();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // 檢查登入
    handleNotLogIn();

    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await createComment({
        post_id: postId,
        item_id: itemId === "all" ? null : (itemId ?? null), // "all" 轉成 null
        parent_id: parentId,
        user_id: Number(user!.userId),
        content: content.trim(),
        public_id: user!.public_id,
      });

      setContent("");
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || t("submitFailed"));
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError(t("submitFailed"));
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

  const handleNotLogIn = () => {
    if (!user) {
      toast(t("signInToComment"));
      setTimeout(() => {
        router.push(
          `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
        );
      }, 1000);
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-3">
        {/* 使用者頭像 */}
        <div
          className={`relative flex-shrink-0 ${
            parentId ? "h-7 w-7" : "h-9 w-9"
          }`}
        >
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={t("yourAvatarAlt")}
              fill
              className="rounded-full object-cover"
            />
          ) : (
            <div
              className={`${
                parentId ? "h-7 w-7" : "h-9 w-9"
              } flex items-center justify-center rounded-full bg-gray-300`}
            >
              <span className="text-sm text-gray-600">
                {user?.username?.charAt(0) || "?"}
              </span>
            </div>
          )}
        </div>

        {/* 輸入框 */}
        <div className="relative flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              user ? (placeholder ?? t("writeComment")) : t("signInPlaceholder")
            }
            onFocus={handleNotLogIn}
            autoFocus={autoFocus}
            disabled={isSubmitting}
            maxLength={MAX_CHARACTER_LIMIT}
            rows={parentId ? 2 : 3}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100"
          />
          {/* ✅ 增加字數提示計數器 */}
          {user && (
            <div
              className={`mt-0.5 text-right text-[10px] ${
                content.length >= MAX_CHARACTER_LIMIT
                  ? "font-bold text-red-500"
                  : "text-gray-400"
              }`}
            >
              {t("characterCount", {
                count: formatter.number(content.length),
                max: formatter.number(MAX_CHARACTER_LIMIT),
              })}
            </div>
          )}
        </div>
      </div>

      {/* 錯誤訊息 */}
      {error && <p className="ml-12 mt-1 text-sm text-red-500">{error}</p>}

      {/* 按鈕 */}
      <div className="mt-2 flex justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!user ? t("logIn") : isSubmitting ? t("submitting") : t("submit")}
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
