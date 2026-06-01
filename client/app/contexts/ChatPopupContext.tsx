"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface ChatPopupOtherUser {
  public_id: string;
  username: string;
  avatar_url?: string;
}

interface ChatPopupContextType {
  isOpen: boolean;
  conversationId: number | null;
  otherUser: ChatPopupOtherUser | null;
  openChat: (conversationId: number, otherUser: ChatPopupOtherUser) => void;
  closeChat: () => void;
}

const ChatPopupContext = createContext<ChatPopupContextType | undefined>(undefined);

export const ChatPopupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [otherUser, setOtherUser] = useState<ChatPopupOtherUser | null>(null);

  const openChat = (id: number, user: ChatPopupOtherUser) => {
    setConversationId(id);
    setOtherUser(user);
    setIsOpen(true);
  };

  const closeChat = () => {
    setIsOpen(false);
    // Optionally clear data after animation
    setTimeout(() => {
        if (!isOpen) {
            setConversationId(null);
            setOtherUser(null);
        }
    }, 300);
  };

  return (
    <ChatPopupContext.Provider value={{ isOpen, conversationId, otherUser, openChat, closeChat }}>
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
