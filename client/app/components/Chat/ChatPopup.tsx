"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import { useUser } from "@/app/contexts/UserContext";
import { ChatWindow } from "./ChatWindow";
import WeavingIcon from "../icons/WeavingIcon";
import { Button } from "@/components/ui/button";
import PostInfoCard from "./PostInfoCard";

export const ChatPopup = () => {
  const { isOpen, conversationId, otherUser, post, pendingItem, closeChat } = useChatPopup();
  const { user: currentUser } = useUser();

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
            className="fixed bottom-4 left-4 right-4  max-w-[500px] mx-auto bg-white rounded-[40px] shadow-2xl z-[101] flex flex-col h-[65vh] overflow-hidden border border-primary-30"
          >
            {/* Header (Always shown in Popup) */}
            <div className="px-8 pt-4 pb-2 flex items-center justify-between bg-white z-10">
              <h2 className="text-[20px] font-bold text-gray-800 font-ddin">
                {otherUser.username}
              </h2>
              <button
                onClick={closeChat}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-megaweave-forest-dark" />
              </button>
            </div>

            {/* Reusable ChatWindow Component */}
            <div className="flex-1 overflow-hidden relative">
              <ChatWindow
                key={conversationId}
                conversationId={conversationId}
                currentUser={currentUser}
                otherUser={otherUser}
                isPopup={true}
              />

              {/* Giver Confirm Overlay */}
              {/*  if currentUser is giver (in conversation) */}
              {post && (
                <div className="absolute top-0 left-0 right-0 z-10">
                  <PostInfoCard post={post} item={pendingItem} />
                </div>
              )}
              <div className="absolute bottom-20 right-6 flex flex-col items-end gap-2 pointer-events-none">
                <div className="flex items-center gap-6 pointer-events-auto">
                  <div className="relative bg-white border border-[#D9D9D9] px-4 py-2 rounded-full shadow-sm">
                    <span className="text-[14px] text-gray-700 font-medium">
                      Click to confirm weaving
                    </span>
                    <div className="absolute -top-1 -left-1 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center border-2 border-white">
                      <X className="w-2 h-2 text-white" />
                    </div>
                    <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-r border-t border-[#D9D9D9] rotate-45" />
                  </div>
                  <div>
                    <Button
                      variant={"ghost"}
                      className="p-0 m-0 flex items-center"
                    >
                      <WeavingIcon className="!w-8 !h-8 text-megaweave-forest-dark" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
