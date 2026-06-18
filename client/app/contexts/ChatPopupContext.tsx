"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Post } from "../types/schema";

interface ChatPopupOtherUser {
  public_id: string;
  username: string;
  avatar_url?: string;
}

interface ChatPopupContextType {
  isOpen: boolean;
  conversationId: number | null;
  otherUser: ChatPopupOtherUser | null;
  post: Post | null;
  openChat: (
    conversationId: number,
    otherUser: ChatPopupOtherUser,
    post?: Post,
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
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const storedState = sessionStorage.getItem("chatPopupState");
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        if (parsed.isOpen && parsed.conversationId && parsed.otherUser) {
          setConversationId(parsed.conversationId);
          setOtherUser(parsed.otherUser);
          if (parsed.post) setPost(parsed.post);
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
          JSON.stringify({ isOpen, conversationId, otherUser, post })
        );
      } else {
        sessionStorage.removeItem("chatPopupState");
      }
    }
  }, [isOpen, conversationId, otherUser, post, isInitialized]);

  const openChat = (
    id: number,
    user: ChatPopupOtherUser,
    currentPost?: Post,
  ) => {
    setConversationId(id);
    setOtherUser(user);
    if (currentPost) {
      setPost(currentPost);
    }
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
    // Optionally clear data after animation
    setTimeout(() => {
      if (!isOpen) {
        setConversationId(null);
        setOtherUser(null);
        setPost(null);
      }
    }, 300);
  };

  return (
    <ChatPopupContext.Provider
      value={{ isOpen, conversationId, otherUser, post, openChat, closeChat }}
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
