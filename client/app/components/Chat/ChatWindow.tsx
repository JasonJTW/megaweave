import React, { useState, useEffect, useRef } from "react";
import { Message } from "@/app/types/schema";
import { useMessages, useChatSocket } from "@/hooks/useChat";
import { useSWRConfig } from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, isToday, isYesterday } from "date-fns";
import { zhTW } from "date-fns/locale";
import { SendIcon, ArrowLeft, Check, CheckCheck, ImageIcon, X, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { compressImage } from "@/utils/imageProcessor";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

import { User } from "@/app/types/schema";

interface ChatWindowProps {
  conversationId: number;
  currentUser: User | null; 
  otherUser?: {
    public_id: string;
    username: string;
    avatar_url?: string;
  };
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  currentUser,
  otherUser: propOtherUser,
}) => {
  const { messages, conversation, isLoading, mutate, fetchMore, hasMore } = useMessages(conversationId);
  const { mutate: globalMutate } = useSWRConfig();
  useChatSocket(conversationId);
  
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || isLoading || isFetchingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsFetchingMore(true);
          fetchMore().finally(() => setIsFetchingMore(false));
        }
      },
      { threshold: 1.0 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, isFetchingMore, fetchMore]);
  
  // Use prop if available (from list), otherwise fallback to fetched conversation details
  const otherUser = propOtherUser || (conversation ? {
      public_id: conversation.other_public_id,
      username: conversation.other_username,
      avatar_url: conversation.other_avatar_url
  } : undefined);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(true); // Track window focus
  
  // Image selective states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [prevFirstMessageId, setPrevFirstMessageId] = useState<number | string | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    // With flex-col-reverse, the 'bottom' is actually the start of scroll container (0)
    // But using a ref at the beginning is more robust across browsers.
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const currentFirstMessageId = messages[0]?.id || null;
    
    // 1. Initial Load: No previous messages, now we have some.
    const isInitialLoad = prevFirstMessageId === null && currentFirstMessageId !== null;
    
    // 2. New Message: The latest message ID has changed.
    // We only care if the START of the messages array changed (newest messages)
    const isNewMessageAdded = prevFirstMessageId !== null && currentFirstMessageId !== prevFirstMessageId;

    if (isInitialLoad || isNewMessageAdded) {
      // Use auto for initial load, smooth for new messages
      scrollToBottom(isInitialLoad ? "auto" : "smooth");
    }
    
    // Update the tracker
    setPrevFirstMessageId(currentFirstMessageId);
  }, [messages, prevFirstMessageId]);

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


  // Handle Image Selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 10 images
    if (selectedFiles.length + files.length > 10) {
      toast.error("Maximum 10 images allowed");
      return;
    }

    const newPreviews: string[] = [];
    const newFiles: File[] = [];

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (>10MB)`);
        continue;
      }
      
      const objectUrl = URL.createObjectURL(file);
      newPreviews.push(objectUrl);
      newFiles.push(file);
    }

    setPreviews(prev => [...prev, ...newPreviews]);
    setSelectedFiles(prev => [...prev, ...newFiles]);
    
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPreviews(prev => prev.filter((_, i) => i !== index));
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      previews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && selectedFiles.length === 0) || !otherUser) return;
    
    setIsSending(true);
    const content = inputValue;
    const filesToSend = [...selectedFiles];
    const previewUrls = [...previews];
    
    setInputValue(""); // Clear input immediately
    setSelectedFiles([]);
    setPreviews([]);

    // Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
        id: tempId, 
        conversation_id: conversationId,
        sender_public_id: currentUser?.public_id || "",
        content: content,
        is_read: false,
        created_at: new Date().toISOString(),
        attachments: filesToSend.map((file, i) => ({
            id: Math.random(), // Temporary ID for rendering
            message_id: 0,
            file_url: previewUrls[i], // Use object URL for immediate display
            file_type: 'image',
            created_at: new Date().toISOString()
        }))
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
      const formData = new FormData();
      formData.append("recipient_public_id", otherUser.public_id);
      formData.append("content", content);
      
      // Compress and append images
      for (const file of filesToSend) {
          const compressed = await compressImage(file, 1200, 1200, 0.85);
          if (compressed) {
              formData.append("images", compressed, "image.webp");
          } else {
              formData.append("images", file);
          }
      }

      const res = await fetch(`${hostName}/api/messages`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
          // If the server responded with an error, revert optimistic update
          mutate(
              (currentData) => {
                  if (!currentData) return currentData;
                  return {
                      ...currentData,
                      messages: currentData.messages.filter(msg => msg.id !== tempId)
                  };
              },
              false
          );
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to send message");
      }

      // If successful, revalidate to get the actual message with real ID and status
      // This will replace the optimistic message
      mutate(); // Revalidate all messages for this conversation

    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send message.");
      // If an error occurred, and the optimistic update was not reverted by !res.ok,
      // ensure it's removed here. This handles network errors or other exceptions.
      mutate(
          (currentData) => {
              if (!currentData) return currentData;
              return {
                  ...currentData,
                  messages: currentData.messages.filter(msg => msg.id !== tempId)
              };
          },
          false
      );
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
        {/* Anchor point for scrolling to bottom */}
        <div ref={messagesEndRef} />
        
        {isLoading ? (
            <div className="text-center text-gray-400 mt-10">Loading messages...</div>
        ) : (
            messages.map((msg, index) => { 
               const myPublicId = currentUser?.public_id || "";
               const isMe = msg.sender_public_id === myPublicId;
               

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
               if (olderMsg) {
                   const olderMsgDate = parseDate(olderMsg.created_at);
                   const isSameDay = format(msgDate, 'yyyy-MM-dd') === format(olderMsgDate, 'yyyy-MM-dd');
                   if (!isSameDay) {
                       // Different day from previous message -> Show Header
                       showDateHeader = true;
                   }
               } else {
                   // No older message in memory.
                   // Only show header if we are absolutely sure there are no more messages in the DB.
                   if (!hasMore) {
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

               // 找出「我發送的且已被讀取」的最後一則訊息索引
               const lastReadIndex = messages.findIndex(m => m.sender_public_id === myPublicId && m.is_read);
               const isLastReadMessage = lastReadIndex === index;

               return (
                   <React.Fragment key={msg.id}>
                       <div className={cn("flex w-full mb-4", isMe ? "justify-end" : "justify-start")}>
                            {!isMe && (
                                 <Avatar className="w-8 h-8 mr-2 mt-1">
                                    <AvatarImage src={otherUser?.avatar_url} />
                                    <AvatarFallback>{otherUser?.username?.substring(0, 1).toUpperCase()}</AvatarFallback>
                                 </Avatar>
                            )}
                             <div className={cn(
                                 "flex flex-col",
                                 isMe ? "items-end" : "items-start"
                             )}>
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mb-1">
                                        {msg.attachments.length === 1 ? (
                                            /* Single image - large, standalone */
                                            <div className="relative w-[280px] h-[210px] sm:w-[340px] sm:h-[255px] rounded-xl overflow-hidden bg-gray-100 shadow-sm">
                                                <Image 
                                                    src={msg.attachments[0].file_url} 
                                                    alt="Attachment" 
                                                    fill 
                                                    className="object-cover"
                                                    sizes="340px"
                                                    unoptimized={msg.attachments[0].file_url.startsWith('blob:')}
                                                />
                                            </div>
                                        ) : (
                                            /* Multiple images - grid */
                                            <div className={cn(
                                                "grid gap-1.5",
                                                msg.attachments.length === 2 ? "grid-cols-2 w-[280px] sm:w-[340px]" :
                                                msg.attachments.length === 3 ? "grid-cols-2 w-[280px] sm:w-[340px]" :
                                                "grid-cols-2 w-[280px] sm:w-[340px]"
                                            )}>
                                                {msg.attachments.map((att, attIdx) => (
                                                    <div 
                                                        key={att.id} 
                                                        className={cn(
                                                            "relative rounded-xl overflow-hidden bg-gray-100 shadow-sm aspect-square",
                                                            msg.attachments!.length === 3 && attIdx === 0 && "col-span-2 aspect-[2/1]"
                                                        )}
                                                    >
                                                        <Image 
                                                            src={att.file_url} 
                                                            alt="Attachment" 
                                                            fill 
                                                            className="object-cover"
                                                            sizes="170px"
                                                            unoptimized={att.file_url.startsWith('blob:')}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {msg.content && (
                                    <div className={cn(
                                        "px-4 py-2 rounded-2xl break-words shadow-sm max-w-[280px] sm:max-w-[340px]",
                                        isMe 
                                          ? "bg-blue-500 text-white rounded-br-none" 
                                          : "bg-white text-gray-800 border rounded-bl-none"
                                    )}>
                                        <p className="text-[14px] sm:text-base leading-relaxed">{msg.content}</p>
                                    </div>
                                )}

                                <div className={cn(
                                    "flex items-center mt-1 text-[10px]",
                                    isMe ? "justify-end text-blue-400" : "justify-start text-gray-400"
                                )}>
                                    <span>{format(parseDate(msg.created_at), "HH:mm")}</span>
                                    {isMe && (
                                        <span className="ml-1 flex items-center h-3">
                                            {isLastReadMessage ? (
                                                <>
                                                    <span className="mr-0.5">read</span>
                                                    <CheckCheck className="w-3 h-3" />
                                                </>
                                            ) : (
                                                // 如果不是最後一則已讀，則根據 is_read 顯示雙勾或單勾
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
        {hasMore && (
            <div ref={loadMoreRef} className="h-10 flex items-center justify-center py-4">
                {isFetchingMore && <span className="text-xs text-gray-400">Loading older messages...</span>}
            </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-white">
        {/* Previews */}
        {previews.length > 0 && (
            <div className="flex gap-2 p-2 overflow-x-auto bg-gray-50 border-b">
                {previews.map((url, i) => (
                    <div key={url} className="relative w-20 h-20 flex-shrink-0 group">
                        <Image src={url} alt="Preview" fill className="object-cover rounded-md border" />
                        <button 
                            onClick={() => removeSelectedImage(i)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
        )}
        
        <form onSubmit={handleSend} className="p-4 flex items-center gap-2">
            <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*" 
                multiple 
                onChange={handleImageSelect}
            />
            <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="text-gray-400 hover:text-blue-500"
            >
                <ImageIcon className="w-6 h-6" />
            </Button>
            <Input 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                disabled={isSending}
            />
            <Button type="submit" size="icon" disabled={isSending || (!inputValue.trim() && selectedFiles.length === 0)}>
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
            </Button>
        </form>
      </div>
    </div>
  );
};
