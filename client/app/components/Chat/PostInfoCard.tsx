"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { Post } from "@/app/types/schema";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import User from "@/app/types/user";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  WeaveDraft,
  SelectedWeaveItem,
  createInitialDraft,
  toggleDraftItem,
  updateDraftItemQuantity,
  getWeaveSubmitPayload,
  getDraftSelectedLabel,
} from "@/app/types/weaveDraft";
import { QuantityStepper } from "@/app/components/ui/QuantityStepper";

export type { SelectedWeaveItem };

interface PostInfoCardProps {
  post: Post;
  user?: User | null;
  onWeavingSubmit?: (items: SelectedWeaveItem[]) => void;
}

const PostInfoCard: React.FC<PostInfoCardProps> = ({
  post,
  onWeavingSubmit,
}) => {
  const { draft: contextDraft, setDraft } = useChatPopup();

  // If context has draft for this post, use it as single source of truth.
  // Otherwise fallback to local state (e.g. if rendered outside provider).
  const [localDraft, setLocalDraft] = useState<WeaveDraft>(() =>
    createInitialDraft(post),
  );

  // Sync draft if post.id changes during render (React recommended pattern without useEffect)
  const [prevPostId, setPrevPostId] = useState(post.id);
  if (prevPostId !== post.id) {
    setPrevPostId(post.id);
    const next = createInitialDraft(post);
    setLocalDraft(next);
  }

  const draft =
    contextDraft && contextDraft.postId === post.id ? contextDraft : localDraft;

  const [isExpanded, setIsExpanded] = useState(false);

  const s3Keys = parseS3Keys(post);
  const firstKey = s3Keys[0];
  const firstImg = firstKey
    ? firstKey.startsWith("http")
      ? firstKey
      : getImageUrl(firstKey, "thumb")
    : null;

  const hasSubItems = draft.items.length > 0;
  const selectedItems = draft.items.filter(
    (it) => it.selected && it.quantity > 0,
  );
  const selectedCount = selectedItems.length;

  const handleToggleItem = (itemId: number) => {
    const next = toggleDraftItem(draft, itemId);
    if (contextDraft && contextDraft.postId === post.id) {
      setDraft?.(next);
    } else {
      setLocalDraft(next);
      setDraft?.(next);
    }
  };

  const handleQuantityChange = (itemId: number, qty: number) => {
    const next = updateDraftItemQuantity(draft, itemId, qty);
    if (contextDraft && contextDraft.postId === post.id) {
      setDraft?.(next);
    } else {
      setLocalDraft(next);
      setDraft?.(next);
    }
  };

  const handleSubmit = () => {
    if (!onWeavingSubmit) return;
    const payload = getWeaveSubmitPayload(draft);
    onWeavingSubmit(payload);
  };

  const isSubmitDisabled = draft.mode === "custom" && selectedCount === 0;

  return (
    <div className="flex w-full flex-shrink-0 flex-col border-b border-primary-30 bg-primary-15 font-ddin transition-all">
      {/* 上半部：主貼文縮圖與標題資訊 */}
      <div className="flex h-[80px] w-full items-center gap-2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {firstImg ? (
            <Image
              width={48}
              height={48}
              src={firstImg}
              className="aspect-square flex-shrink-0 rounded-md object-cover"
              alt={post.title}
            />
          ) : (
            <div className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-md bg-gray-200 text-[9px] text-gray-400">
              No img
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-[14px] font-bold leading-tight text-gray-800">
              {post.title}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[13px] leading-none text-gray-500">
              <span>{getDraftSelectedLabel(draft)}</span>
              {hasSubItems && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-0.5 font-bold text-primary hover:underline"
                >
                  {isExpanded ? (
                    <>
                      Hide items <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Choose items ({draft.items.length}){" "}
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 右側：動作按鈕 */}
        {onWeavingSubmit && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="h-[34px] w-auto flex-shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {post.type === "wish" ? "Offer" : "Request"}
              {draft.mode === "custom" ? ` (${selectedCount})` : ""}
            </Button>
          </div>
        )}
      </div>

      {/* 下半部 (只在點擊 Choose items 展開時才顯示)：包含該 Post 下所有 Items 勾選與數量步進器 */}
      <AnimatePresence initial={false}>
        {isExpanded && hasSubItems && (
          <motion.div
            key="items-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto border-t border-primary-30/40 bg-primary-15 px-3 py-4">
              {draft.items.map((it) => {
                const hasStock = it.quantityLeft > 0;
                const isChecked = it.selected && hasStock;
                const currentQty = it.quantity;
                const quantityLeft = it.quantityLeft;

                return (
                  <div
                    key={it.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                      !hasStock
                        ? "border border-gray-100 bg-gray-50 opacity-60"
                        : isChecked
                          ? "border border-primary/20 bg-primary/10"
                          : "border border-gray-100 bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <label
                      className={`flex min-w-0 flex-1 items-center gap-2 ${
                        hasStock ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleItem(it.id)}
                        disabled={!hasStock}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-40"
                      />
                      <span
                        className={`truncate text-[13px] font-semibold ${
                          hasStock ? "text-gray-800" : "text-gray-400"
                        }`}
                      >
                        {it.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        (Left: {it.quantityLeft})
                      </span>
                    </label>

                    {isChecked && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] font-medium text-gray-500">
                          Qty:
                        </span>
                        <QuantityStepper
                          value={currentQty}
                          min={1}
                          max={quantityLeft}
                          onChange={(qty) => handleQuantityChange(it.id, qty)}
                          disabled={!isChecked}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PostInfoCard;
