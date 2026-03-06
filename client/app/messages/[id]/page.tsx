"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ConversationList } from "@/app/components/Chat/ConversationList";
import { ChatWindow } from "@/app/components/Chat/ChatWindow";
import { useConversations } from "@/hooks/useChat";
import { useUser } from "../../contexts/UserContext";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = Number(params?.id);

  // Fetch conversations to find the "otherUser" details for the header
  const { conversations } = useConversations();
  const currentConversation = conversations.find(c => c.id === conversationId);

  // We also need currentUser for the chat window (to know which side to align)
  const { user: currentUser } = useUser();

  // If conversation not found in list, it might be loading or user manual entry. 
  // ChatWindow handles loading its own messages.
  // But for header info (username/avatar), we fallback to what's in conversation list or wait.
  // Ideally ChatWindow should verify membership.

  return (
    <div className="container max-w-6xl mx-auto h-[calc(100vh-64px)] p-0 md:p-4">
       <div className="flex h-full bg-white rounded-lg shadow-sm overflow-hidden border">
           {/* Sidebar - Hidden on mobile when inside chat, Visible on desktop */}
           <div className="hidden md:block w-1/3 border-r h-full">
               <ConversationList currentConversationId={conversationId} />
           </div>
           
           {/* Chat Window - Full width on mobile, Right side on desktop */}
           <div className="w-full md:flex-1 h-full">
               {conversationId ? (
                   <ChatWindow 
                      conversationId={conversationId} 
                      currentUser={currentUser}
                      otherUser={currentConversation ? {
                          public_id: currentConversation.other_public_id,
                          username: currentConversation.other_username,
                          avatar_url: currentConversation.other_avatar_url
                      } : undefined}
                   />
               ) : (
                   <div className="flex items-center justify-center h-full">Loading...</div>
               )}
           </div>
       </div>
    </div>
  );
}
