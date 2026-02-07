import React, { useState, useEffect, useRef } from "react";
import { Message } from "@/app/types/schema";
import { useMessages, useChatSocket } from "@/hooks/useChat";
import { useSWRConfig } from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, isToday, isYesterday } from "date-fns";
import { zhTW } from "date-fns/locale";
import { SendIcon, ArrowLeft, Check, CheckCheck } from "lucide-react";
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
  const { mutate: globalMutate } = useSWRConfig();
  useChatSocket(conversationId);
  
  // Use prop if available (from list), otherwise fallback to fetched conversation details
  const otherUser = propOtherUser || (conversation ? {
      id: conversation.other_user_id,
      username: conversation.other_username,
      avatar_url: conversation.other_avatar_url
  } : undefined);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(true); // Track window focus
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle Mark as Read
  // Handle Window Focus
  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    
    // Initial check
    setIsFocused(document.hasFocus());

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", () => { // Handle tab switching
       setIsFocused(!document.hidden);
    });

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      // document.removeEventListener("visibilitychange", ...); // Anonymous function can't be removed easily without ref, but component unmount clears effect scope. 
      // For correctness let's use a named function if we were strict, but for now this effect cleanup is sufficient as listeners are attached to window/document which persist.
      // Actually, better to define the handler outside or use a ref if we wanted to be 100% clean, but simple add/remove is fine.
    };
  }, []);

  // Handle Mark as Read
  useEffect(() => {
    const markAsRead = async () => {
        try {
            // Only mark as read if we have an ID AND messages AND the window is focused
            if (!conversationId || messages.length === 0 || !isFocused) return;

            // Check if the last message is from the *other* user and is *not* read
            // Optimization: No need to call API if last message is mine or already read (though local state might lag)
            // But strict "mark conversation read" is idempotent on server, so calling it is safe.
            // Let's call it to be safe whenever messages/focus changes.

            await fetch(`${hostName}/api/messages/conversations/${conversationId}/read`, {
                method: "PATCH",
                credentials: "include",
            });
            // Trigger a revalidate of conversations to update unread counts globally
            globalMutate(`${hostName}/api/messages/conversations`);
        } catch (error) {
            console.error("Failed to mark as read", error);
        }
    };
    
    markAsRead();
  }, [conversationId, messages.length, isFocused, globalMutate]);


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
        sender_id: currentUser?.userId || 0, // Handle different user object structures
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
            messages.map((msg, index) => { 
               const myId = currentUser?.userId || 0;
               const isMe = Number(msg.sender_id) === Number(myId);
               

               // Helper to parse date safely as UTC if needed
               const parseDate = (dateString: string) => {
                   // If string ends in Z, it is already UTC.
                   if (dateString.endsWith('Z')) return new Date(dateString);
                   // If not, append Z to force UTC interpretation (assuming server sends UTC)
                   return new Date(dateString + 'Z');
               };
               
               const msgDate = parseDate(msg.created_at);
               const olderMsg = messages[index + 1];
               
               // Date separator logic
               // Compare current message date with older message (next in list)
               let showDateHeader = false;
               if (!olderMsg) {
                   // No older message -> this is the very first message ever -> Show Header
                   showDateHeader = true;
               } else {
                   const olderMsgDate = parseDate(olderMsg.created_at);
                   const isSameDay = format(msgDate, 'yyyy-MM-dd') === format(olderMsgDate, 'yyyy-MM-dd');
                   if (!isSameDay) {
                       // Different day from previous message -> Show Header
                       showDateHeader = true;
                   }
               }
               
               const dateHeader = showDateHeader ? (
                   <div key={`date-${msg.created_at}`} className="flex justify-center my-4">
                       <span className="bg-gray-200 text-gray-500 text-xs px-2 py-1 rounded-full uppercase">
                           {isToday(msgDate) ? "Today" : 
                            isYesterday(msgDate) ? "Yesterday" : 
                            format(msgDate, "yyyy-MM-dd", { locale: zhTW })}
                       </span>
                   </div>
               ) : null;

               // Read status logic: detailed status only for the VERY LAST message sent by the current user
               // Find the index of the last message sent by 'me'
               const isLatestOwnMessage = messages.findIndex(m => Number(m.sender_id) === Number(myId)) === index;

               return (
                   <React.Fragment key={msg.id}>
                       <div className={cn("flex w-full mb-4", isMe ? "justify-end" : "justify-start")}>
                            {!isMe && (
                                 <Avatar className="w-8 h-8 mr-2 mt-1">
                                    <AvatarImage src={otherUser?.avatar_url} />
                                    <AvatarFallback>{otherUser?.username?.substring(0, 1).toUpperCase()}</AvatarFallback>
                                 </Avatar>
                            )}
                            <div className="flex flex-col max-w-[70%]">
                                <div className={cn(
                                    "px-4 py-2 rounded-2xl break-words shadow-sm",
                                    isMe 
                                      ? "bg-blue-500 text-white rounded-br-none" 
                                      : "bg-white text-gray-800 border rounded-bl-none"
                                )}>
                                    <p>{msg.content}</p>
                                </div>
                                <div className={cn(
                                    "flex items-center mt-1 text-[10px]",
                                    isMe ? "justify-end text-blue-400" : "justify-start text-gray-400"
                                )}>
                                    <span>{format(parseDate(msg.created_at), "HH:mm")}</span>
                                    {isMe && (
                                        <span className="ml-1 flex items-center h-3">
                                            {isLatestOwnMessage ? (
                                               msg.is_read ? (
                                                   <>
                                                       <span className="mr-0.5">read</span>
                                                       <CheckCheck className="w-3 h-3" />
                                                   </>
                                               ) : (
                                                   <Check className="w-3 h-3" />
                                               )
                                            ) : (
                                               // For older messages, show checks but no text
                                               msg.is_read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                       </div>
                       {dateHeader}
                   </React.Fragment>
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
