"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import { useUser } from "@/app/contexts/UserContext";
import { ChatWindow } from "./ChatWindow";
import PostInfoCard, { SelectedWeaveItem } from "./PostInfoCard";
import { createWeave } from "@/services/weaveService";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useSWRConfig } from "swr";

export const ChatPopup = () => {
  const { mutate: globalMutate } = useSWRConfig();
  const {
    isOpen,
    conversationId,
    otherUser,
    post,
    draft,
    setDraft,
    closeChat,
  } = useChatPopup();
  const { user: currentUser } = useUser();
  const router = useRouter();

  // Weaving 提交邏輯：由 PostInfoCard 回調，在此執行 API 呼叫
  const handleWeavingSubmit = async (selectedItems: SelectedWeaveItem[]) => {
    if (!currentUser) {
      toast.error("Please log in to request items.");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
      );
      return;
    }
    if (!post) return;

    if (currentUser.userId === (post.author_user_id ?? post.user_id)) {
      toast.error("You cannot request your own items.");
      return;
    }

    if (selectedItems.length === 0) {
      toast.error("Please select at least one item.");
      return;
    }

    try {
      const newWeave = await createWeave({
        postId: post.id,
        items: selectedItems.map((it) => ({
          itemId: it.itemId ?? null,
          quantity: it.quantity,
        })),
      });
      void newWeave;

      // draft is the single source of truth — clearing it collapses the PostInfoCard
      setDraft(null);

      const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
      if (conversationId) {
        globalMutate(
          `${hostName}/api/messages/conversations/${conversationId}`,
        );
      }
      globalMutate(`${hostName}/api/messages/conversations`);
      globalMutate(`${hostName}/api/weaves`);

      toast.success("Request sent successfully!");
    } catch (err: unknown) {
      console.error("Weaving submit error:", err);
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("An unexpected error occurred.");
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && otherUser && conversationId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeChat}
            className="fixed inset-0 z-[100]"
          />

          {/* Popup Container */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-4 left-4 right-4 z-[101] mx-auto flex h-[65vh] max-w-[500px] flex-col overflow-hidden rounded-[40px] border border-primary-30 shadow-2xl"
          >
            {/* Header */}
            <div className="z-10 flex items-center justify-between bg-white px-8 pb-2 pt-4">
              <h2 className="font-ddin text-[20px] font-bold text-gray-800">
                {otherUser.username}
              </h2>
              <button
                onClick={closeChat}
                className="rounded-full p-2 transition-colors hover:bg-gray-100"
              >
                <X className="h-6 w-6 text-megaweave-forest-dark" />
              </button>
            </div>

            {/* PostInfoCard — draft 是唯一的顯示條件，不再需要 pendingItem */}
            {post && draft && (
              <PostInfoCard
                key={post.id}
                post={post}
                user={currentUser}
                onWeavingSubmit={handleWeavingSubmit}
              />
            )}

            {/* ChatWindow — flex-1 佔滿剩餘空間 */}
            <div className="flex-1 overflow-hidden">
              <ChatWindow
                key={conversationId}
                conversationId={conversationId}
                currentUser={currentUser}
                otherUser={otherUser}
                isPopup={true}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
