import React, { useState, useEffect, useRef } from "react";
import { Message } from "@/app/types/schema";
import { useMessages, useChatSocket } from "@/hooks/useChat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { SendIcon, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

import { User } from "@/app/types/schema";

interface ChatWindowProps {
  conversationId: number;
  currentUser: User | null; 
  otherUser?: {
    id: number;
    username: string;
    avatar_url?: string;
  };
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  currentUser,
  otherUser: propOtherUser,
}) => {
  const { messages, conversation, isLoading, mutate } = useMessages(conversationId);
  useChatSocket(conversationId);
  
  // Use prop if available (from list), otherwise fallback to fetched conversation details
  const otherUser = propOtherUser || (conversation ? {
      id: conversation.other_user_id,
      username: conversation.other_username,
      avatar_url: conversation.other_avatar_url
  } : undefined);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle Mark as Read
  useEffect(() => {
    const markAsRead = async () => {
        try {
            await fetch(`${hostName}/api/messages/conversations/${conversationId}/read`, {
                method: "PATCH",
                credentials: "include",
            });
            // Update local unread count - wait, that's in conversation list.
            // But we might want to update the conversation list cache too. 
            // The socket 'read' event (if implemented) or just manual mutate.
            // For now simplest is we assume it's read when opened.
        } catch (error) {
            console.error("Failed to mark as read", error);
        }
    };
    if (conversationId && messages.length > 0) {
        markAsRead();
    }
  }, [conversationId, messages.length]);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !otherUser) return;
    
    setIsSending(true);
    const content = inputValue;
    setInputValue(""); // Clear input immediately

    // Optimistic Update
    const tempId = Date.now();
    const optimisticMessage: Message = {
        id: tempId, // temp ID
        conversation_id: conversationId,
        sender_id: currentUser?.id || currentUser?.userId || 0, // Handle different user object structures
        content: content,
        is_read: false,
        created_at: new Date().toISOString(),
    };

    // Update local cache immediately
    mutate(
        (currentData) => {
            if (!currentData) return { messages: [optimisticMessage], hasMore: false };
            return {
                ...currentData,
                messages: [optimisticMessage, ...currentData.messages] 
            };
        },
        false 
    );

    try {
      const res = await fetch(`${hostName}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
           recipientId: otherUser.id,
           content: content
        }),
      });
      
      if (!res.ok) throw new Error("Failed to send");
      
      // Revalidate to ensure data consistency (replace temp ID with real ID)
      mutate(); 
      
    } catch (error) {
       console.error("Send error", error);
       setInputValue(content); 
       // Rollback is tricky without undoing other changes, but revalidating will fix it
       mutate();
    } finally {
       setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center p-4 border-b">
        <Link href="/messages" className="md:hidden mr-3">
             <ArrowLeft className="w-6 h-6" />
        </Link>
        <Avatar className="w-10 h-10 mr-3">
          <AvatarImage src={otherUser?.avatar_url} />
          <AvatarFallback>{otherUser?.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
           <h2 className="font-bold">{otherUser?.username || "Chat"}</h2>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 gap-4 bg-slate-50 flex flex-col-reverse">
        {isLoading ? (
            <div className="text-center text-gray-400 mt-10">Loading messages...</div>
        ) : (
            messages.map((msg) => { 
               const myId = currentUser?.id || currentUser?.userId || 0;
               const isMe = Number(msg.sender_id) === Number(myId);
               
               return (
                   <div key={msg.id} className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
                        {!isMe && (
                             <Avatar className="w-8 h-8 mr-2 mt-1">
                                <AvatarImage src={otherUser?.avatar_url} />
                                <AvatarFallback>{otherUser?.username?.substring(0, 1).toUpperCase()}</AvatarFallback>
                             </Avatar>
                        )}
                        <div className={cn(
                            "max-w-[70%] px-4 py-2 rounded-2xl break-words shadow-sm",
                            isMe 
                              ? "bg-blue-500 text-white rounded-br-none" 
                              : "bg-white text-gray-800 border rounded-bl-none"
                        )}>
                            <p>{msg.content}</p>
                            <span className={cn("text-[10px] block text-right mt-1", isMe ? "text-blue-100" : "text-gray-400")}>
                                {format(new Date(msg.created_at), "HH:mm")}
                            </span>
                        </div>
                   </div>
               );
            })
        )}
        {/* <div ref={messagesEndRef} /> No longer strictly needed with flex-col-reverse but helpful for initial load jump */}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t bg-white flex items-center gap-2">
         <Input 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            disabled={isSending}
         />
         <Button type="submit" size="icon" disabled={isSending || !inputValue.trim()}>
            <SendIcon className="w-4 h-4" />
         </Button>
      </form>
    </div>
  );
};
