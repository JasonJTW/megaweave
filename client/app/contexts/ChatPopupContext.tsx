"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Post } from "../types/schema";

interface ChatPopupOtherUser {
  public_id: string;
  username: string;
  avatar_url?: string;
}

// Represents an unconfirmed weaving intent (not yet written to DB)
export interface PendingItem {
  id: string | number;
  title: string;
}

interface ChatPopupContextType {
  isOpen: boolean;
  conversationId: number | null;
  otherUser: ChatPopupOtherUser | null;
  post: Post | null;
  pendingItem: PendingItem | null;
  setPendingItem: (item: PendingItem | null) => void;
  openChat: (
    conversationId: number,
    otherUser: ChatPopupOtherUser,
    post?: Post,
    pendingItem?: PendingItem,
  ) => void;
  closeChat: () => void;
}

const ChatPopupContext = createContext<ChatPopupContextType | undefined>(
  undefined,
);

export const ChatPopupProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [otherUser, setOtherUser] = useState<ChatPopupOtherUser | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  // pendingItem: stores unconfirmed weaving intent in memory only.
  // It is written to the DB only when the user sends their first real message.
  const [pendingItem, setPendingItem] = useState<PendingItem | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  // Ref to track the pending closeChat timeout so we can cancel it on re-open
  const closeChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const storedState = sessionStorage.getItem("chatPopupState");
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        if (parsed.isOpen && parsed.conversationId && parsed.otherUser) {
          setConversationId(parsed.conversationId);
          setOtherUser(parsed.otherUser);
          if (parsed.post) setPost(parsed.post);
          if (parsed.pendingItem) setPendingItem(parsed.pendingItem);
          setIsOpen(true);
        }
      } catch (e) {
        console.error("Failed to parse chatPopupState", e);
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      if (isOpen && conversationId && otherUser) {
        sessionStorage.setItem(
          "chatPopupState",
          JSON.stringify({ isOpen, conversationId, otherUser, post, pendingItem })
        );
      } else {
        sessionStorage.removeItem("chatPopupState");
      }
    }
  }, [isOpen, conversationId, otherUser, post, pendingItem, isInitialized]);

  const openChat = (
    id: number,
    user: ChatPopupOtherUser,
    currentPost?: Post,
    item?: PendingItem,
  ) => {
    // Cancel any pending closeChat cleanup to avoid a race condition where
    // closeChat's delayed setPost(null) would overwrite the post we're about
    // to set here.
    if (closeChatTimerRef.current) {
      clearTimeout(closeChatTimerRef.current);
      closeChatTimerRef.current = null;
    }
    setConversationId(id);
    setOtherUser(user);
    // Always update post (even to null) so switching conversations never
    // leaves stale post data from the previous chat.
    setPost(currentPost ?? null);
    // Always update pendingItem (even to null) so switching items always reflects correctly
    setPendingItem(item ?? null);
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
    // Clear data after the exit animation finishes (300ms).
    // Store the timer ID so openChat can cancel it if the popup is re-opened
    // before the timeout fires — otherwise the delayed setPost(null) would
    // wipe out the new post that openChat just set.
    closeChatTimerRef.current = setTimeout(() => {
      closeChatTimerRef.current = null;
      setIsOpen((latestIsOpen) => {
        if (!latestIsOpen) {
          setConversationId(null);
          setOtherUser(null);
          setPost(null);
          setPendingItem(null);
        }
        return latestIsOpen;
      });
    }, 300);
  };

  return (
    <ChatPopupContext.Provider
      value={{ isOpen, conversationId, otherUser, post, pendingItem, setPendingItem, openChat, closeChat }}
    >
      {children}
    </ChatPopupContext.Provider>
  );
};

export const useChatPopup = () => {
  const context = useContext(ChatPopupContext);
  if (context === undefined) {
    throw new Error("useChatPopup must be used within a ChatPopupProvider");
  }
  return context;
};
