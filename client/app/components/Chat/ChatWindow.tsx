import React, { useState, useEffect, useRef } from "react";
import { Message } from "@/app/types/schema";
import { useMessages, useChatSocket } from "@/hooks/useChat";
import { useSWRConfig } from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, isToday, isYesterday } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  SendIcon,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCheck,
  ImageIcon,
  X,
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { compressImage } from "@/utils/imageProcessor";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

import { User } from "@/app/types/schema";

// Helper to parse date safely as UTC if needed
const parseDate = (dateString: string) => {
  if (!dateString) return new Date();
  if (dateString.endsWith("Z")) return new Date(dateString);
  return new Date(dateString + "Z");
};

interface ChatWindowProps {
  conversationId: number;
  currentUser: User | null;
  otherUser?: {
    public_id: string;
    username: string;
    avatar_url?: string;
  };
  isPopup?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  currentUser,
  otherUser: propOtherUser,
  isPopup = false,
}) => {
  const { messages, conversation, isLoading, mutate, fetchMore, hasMore } =
    useMessages(conversationId);
  const { mutate: globalMutate } = useSWRConfig();
  useChatSocket(conversationId);

  // Consume pendingItem from global context — represents the weaving intent
  // before the user sends their first real message.
  const { pendingItem, setPendingItem } = useChatPopup();

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
      { threshold: 1.0 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, isFetchingMore, fetchMore]);

  // Use prop if available (from list), otherwise fallback to fetched conversation details
  const otherUser =
    propOtherUser ||
    (conversation
      ? {
          public_id: conversation.other_public_id,
          username: conversation.other_username,
          avatar_url: conversation.other_avatar_url,
        }
      : undefined);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(true); // Track window focus

  // Image selective states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox states
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxOpen = lightboxUrls.length > 0;

  // Swipe & Pinch-to-zoom refs
  const touchStartX = useRef(0);
  const touchStartDist = useRef(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [animOffset, setAnimOffset] = useState(0); // -1 = sliding next, +1 = sliding prev
  const isAnimating = useRef(false);

  // Collect all image URLs from messages (oldest first)
  const allImageUrls = React.useMemo(() => {
    const urls: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.attachments) {
        for (const att of msg.attachments) {
          if (att.file_type === "image") urls.push(att.file_url);
        }
      }
    }
    return urls;
  }, [messages]);

  const openLightbox = (url: string) => {
    const idx = allImageUrls.indexOf(url);
    setLightboxUrls(allImageUrls);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setZoomScale(1);
    setAnimOffset(0);
  };

  const closeLightbox = () => {
    setLightboxUrls([]);
    setLightboxIndex(0);
    setZoomScale(1);
    setAnimOffset(0);
  };

  const navigateLightbox = (direction: "prev" | "next") => {
    const canGo =
      direction === "prev"
        ? lightboxIndex > 0
        : lightboxIndex < lightboxUrls.length - 1;
    if (!canGo || isAnimating.current) return;
    isAnimating.current = true;
    setZoomScale(1);
    // Start animation: slide the strip
    setAnimOffset(direction === "next" ? -1 : 1);
    // After animation: update index and reset strip position instantly
    setTimeout(() => {
      if (direction === "prev") setLightboxIndex((i) => i - 1);
      else setLightboxIndex((i) => i + 1);
      setAnimOffset(0);
      isAnimating.current = false;
    }, 300);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigateLightbox("prev");
      else if (e.key === "ArrowRight") navigateLightbox("next");
      else if (e.key === "Escape") {
        setLightboxUrls([]);
        setLightboxIndex(0);
        setZoomScale(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, lightboxUrls.length, lightboxIndex]);

  // Helper: get distance between two touch points
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      touchStartDist.current = getTouchDistance(e.touches);
    } else if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist.current > 0) {
      // Pinch zoom
      const currentDist = getTouchDistance(e.touches);
      const ratio = currentDist / touchStartDist.current;
      setZoomScale((prev) => Math.max(1, Math.min(5, prev * ratio)));
      touchStartDist.current = currentDist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Only swipe if not zoomed in and was a single-finger gesture
    if (
      zoomScale <= 1 &&
      e.changedTouches.length === 1 &&
      touchStartDist.current === 0
    ) {
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && lightboxIndex > 0) navigateLightbox("prev");
        else if (diff < 0 && lightboxIndex < lightboxUrls.length - 1)
          navigateLightbox("next");
        e.stopPropagation();
      }
    }
    // Reset pinch tracking
    touchStartDist.current = 0;
    // Snap back if zoomed out below 1
    if (zoomScale < 1.1) setZoomScale(1);
  };

  // Single-tap to close / Double-tap to toggle zoom
  const lastTapTime = useRef(0);
  const closePendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLightboxTap = () => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      // Double-tap: toggle zoom, cancel pending close
      if (closePendingTimer.current) {
        clearTimeout(closePendingTimer.current);
        closePendingTimer.current = null;
      }
      setZoomScale((prev) => (prev > 1 ? 1 : 2.5));
    } else {
      // Single-tap: close after a short delay (if not zoomed)
      if (zoomScale <= 1) {
        closePendingTimer.current = setTimeout(() => {
          closeLightbox();
          closePendingTimer.current = null;
        }, 300);
      } else {
        // If zoomed, single tap resets zoom
        setZoomScale(1);
      }
    }
    lastTapTime.current = now;
  };

  const handleDownload = () => {
    if (!lightboxUrls[lightboxIndex]) return;
    window.open(lightboxUrls[lightboxIndex], "_blank");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [prevFirstMessageId, setPrevFirstMessageId] = useState<
    number | string | null
  >(null);

  // Auto-scroll to bottom
  const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
    // With flex-col-reverse, the 'bottom' is actually the start of scroll container (0)
    // But using a ref at the beginning is more robust across browsers.
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const currentFirstMessageId = messages[0]?.id || null;

    // 1. Initial Load: No previous messages, now we have some.
    const isInitialLoad =
      prevFirstMessageId === null && currentFirstMessageId !== null;

    // 2. New Message: The latest message ID has changed.
    // We only care if the START of the messages array changed (newest messages)
    const isNewMessageAdded =
      prevFirstMessageId !== null &&
      currentFirstMessageId !== prevFirstMessageId;

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
    const handleVisibilityChange = () => setIsFocused(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Handle Mark as Read
  useEffect(() => {
    const markAsRead = async () => {
      try {
        // Only mark as read if we have an ID AND messages AND the window is focused
        if (!conversationId || messages?.length === 0 || !isFocused) return;

        // Check if the last message is from the *other* user and is *not* read
        // Optimization: No need to call API if last message is mine or already read (though local state might lag)
        // But strict "mark conversation read" is idempotent on server, so calling it is safe.
        // Let's call it to be safe whenever messages/focus changes.

        await fetch(
          `${hostName}/api/messages/conversations/${conversationId}/read`,
          {
            method: "PATCH",
            credentials: "include",
          },
        );
        // Trigger a revalidate of conversations to update unread counts globally
        globalMutate(`${hostName}/api/messages/conversations`);
      } catch (error) {
        console.error("Failed to mark as read", error);
      }
    };

    markAsRead();
  }, [conversationId, messages?.length, isFocused, globalMutate]);

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

    setPreviews((prev) => [...prev, ...newPreviews]);
    setSelectedFiles((prev) => [...prev, ...newFiles]);

    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && selectedFiles.length === 0) || !otherUser)
      return;

    setIsSending(true);
    const content = inputValue;
    const filesToSend = [...selectedFiles];
    const previewUrls = [...previews];
    // Capture and immediately clear the pending intent so the banner disappears
    // once the user sends their first message.
    const itemToSend = pendingItem;
    setPendingItem(null);

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
        file_type: "image",
        created_at: new Date().toISOString(),
      })),
    };

    // Update local cache immediately
    mutate((currentData) => {
      if (!currentData)
        return { messages: [optimisticMessage], hasMore: false };
      return {
        ...currentData,
        messages: [optimisticMessage, ...currentData.messages],
      };
    }, false);

    try {
      const formData = new FormData();
      formData.append("recipient_public_id", otherUser.public_id);
      formData.append("content", content);

      // If there is a pending weaving intent, include it so the backend
      // can persist the system message in the same request.
      if (itemToSend) {
        formData.append("item_id", String(itemToSend.id));
        formData.append("item_title", itemToSend.title);
      }

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
        mutate((currentData) => {
          if (!currentData) return currentData;
          return {
            ...currentData,
            messages: currentData.messages.filter((msg) => msg.id !== tempId),
          };
        }, false);
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to send message");
      }

      // If successful, revalidate to get the actual message with real ID and status
      // This will replace the optimistic message
      mutate(); // Revalidate all messages for this conversation
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send message.",
      );
      // Restore the pending item if the send failed so the user doesn't
      // lose their weaving context.
      if (itemToSend) setPendingItem(itemToSend);
      // If an error occurred, and the optimistic update was not reverted by !res.ok,
      // ensure it's removed here. This handles network errors or other exceptions.
      mutate((currentData) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          messages: currentData.messages.filter((msg) => msg.id !== tempId),
        };
      }, false);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-white",
        isPopup && "rounded-t-[40px]",
      )}
    >
      {/* Header - Hidden in popup because ChatPopup handles it */}
      {!isPopup && (
        <div className="flex items-center p-4 border-b">
          <Link href="/messages" className="md:hidden mr-3">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <Avatar className="w-10 h-10 mr-3">
            <AvatarImage src={otherUser?.avatar_url} />
            <AvatarFallback>
              {otherUser?.username?.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-bold">{otherUser?.username || "Chat"}</h2>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        className={cn(
          "flex-1 overflow-y-auto p-4 gap-4 flex flex-col-reverse",
          isPopup ? "bg-white" : "bg-slate-50",
        )}
      >
        {/* Anchor point for scrolling to bottom */}
        <div ref={messagesEndRef} />

        {/* Optimistic "Start weaving" banner — shows at the visual bottom of the
            chat (near the input box) while the user is composing their first
            message. Disappears once the message is sent. */}
        {pendingItem && (
          <div className="flex items-center justify-center gap-4 py-4 w-full my-2">
            <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
            <span className="text-[16px] font-bold text-[#9EB098] font-ddin whitespace-nowrap">
              Start weaving for {pendingItem.title}
            </span>
            <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-gray-400 mt-10">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 mb-10 w-full">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2">
              <Avatar className="w-12 h-12">
                <AvatarImage src={otherUser?.avatar_url} />
                <AvatarFallback>
                  {otherUser?.username?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <p className="font-semibold text-gray-700">No messages yet</p>
            <p className="text-sm">
              Send a message to start the conversation with{" "}
              {otherUser?.username}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const myPublicId = currentUser?.public_id || "";
              const isMe = msg.sender_public_id === myPublicId;

              const msgDate = parseDate(msg.created_at);
              const olderMsg = messages[index + 1];
              // Date separator logic
              // Compare current message date with older message (next in list)
              let showDateHeader = false;
              if (olderMsg) {
                const olderMsgDate = parseDate(olderMsg.created_at);
                const isSameDay =
                  format(msgDate, "yyyy-MM-dd") ===
                  format(olderMsgDate, "yyyy-MM-dd");
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
                <div
                  key={`date-${msg.created_at}`}
                  className="flex justify-center my-4"
                >
                  <span className="bg-gray-200 text-gray-500 text-xs px-2 py-1 rounded-full uppercase">
                    {isToday(msgDate)
                      ? "Today"
                      : isYesterday(msgDate)
                        ? "Yesterday"
                        : format(msgDate, "yyyy-MM-dd", { locale: zhTW })}
                  </span>
                </div>
              ) : null;

              const lastReadIndex = messages.findIndex(
                (m) => m.sender_public_id === myPublicId && m.is_read,
              );
              const isLastReadMessage = lastReadIndex === index;

              if (msg.message_type === "system_start_weaving") {
                let itemTitle = "";
                let quantity = 1;
                let imageUrl = "";
                let weaveId = null;
                let postId = null;

                try {
                  const metadata =
                    typeof msg.metadata === "string"
                      ? JSON.parse(msg.metadata)
                      : msg.metadata;
                  itemTitle = metadata?.item_title || "";
                  quantity = metadata?.quantity || 1;
                  imageUrl = metadata?.image_url || "";
                  weaveId = metadata?.weave_id || null;
                  postId = metadata?.post_id || null;
                } catch {
                  // Ignore parse error
                }

                console.log("system_start_weaving metadata:", msg.metadata, "parsed weaveId:", weaveId);

                if (weaveId) {
                  return (
                    <React.Fragment key={msg.id}>
                      <div className="w-full flex flex-col items-center">
                        {/* 1. Start Weaving Banner (Dotted line text on top) */}
                        <div className="flex items-center justify-center gap-4 py-4 w-full my-2">
                          <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
                          <span className="text-[16px] font-bold text-[#9EB098] font-ddin whitespace-nowrap">
                            Start weaving {itemTitle ? `for ${itemTitle}` : "!"}
                          </span>
                          <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
                        </div>

                        {/* 2. Weaving Request Card (Directly below the banner) */}
                        <div className="flex flex-col items-center justify-center pb-4 w-full px-4">
                          <span className="text-[12px] font-bold text-[#9EB098] font-ddin uppercase tracking-wider mb-2">
                            Weaving Request Sent
                          </span>
                          
                          <div className="w-full max-w-[360px] bg-primary-5 border border-primary-30/50 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:shadow-md transition-shadow duration-200">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {imageUrl ? (
                                <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                                  <Image
                                    fill
                                    src={imageUrl}
                                    className="object-cover"
                                    alt={itemTitle}
                                    sizes="48px"
                                  />
                                </div>
                              ) : (
                                <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-[9px] text-gray-400 flex-shrink-0">
                                  No img
                                </div>
                              )}

                              <div className="min-w-0 flex-1 text-left">
                                <div className="font-bold text-[14px] text-gray-800 truncate leading-tight">
                                  {itemTitle}
                                </div>
                                <div className="text-[11px] text-gray-500 leading-none mt-1">
                                  Request Qty: {quantity}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">
                                Pending
                              </span>
                              <Link
                                href={`/user?highlightWeaveId=${weaveId}`}
                                className="text-[11px] text-primary hover:underline font-bold"
                              >
                                View Detail &rarr;
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                      {dateHeader}
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={msg.id}>
                    <div className="flex items-center justify-center gap-4 py-4 w-full my-2">
                      <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
                      <span className="text-[16px] font-bold text-[#9EB098] font-ddin whitespace-nowrap">
                        Start weaving {itemTitle ? `for ${itemTitle}` : "!"}
                      </span>
                      <div className="flex-1 h-[1px] border-t border-dashed border-gray-300" />
                    </div>
                    {dateHeader}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={msg.id}>
                  <div
                    className={cn(
                      "flex w-full mb-4",
                      isMe ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isMe && (
                      <Avatar className="w-8 h-8 mr-2 mt-1">
                        <AvatarImage src={otherUser?.avatar_url} />
                        <AvatarFallback>
                          {otherUser?.username?.substring(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "flex flex-col",
                        isMe ? "items-end" : "items-start",
                      )}
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-1">
                          {msg.attachments.length === 1 ? (
                            /* Single image - large, standalone */
                            <div
                              className="relative w-[280px] h-[210px] sm:w-[340px] sm:h-[255px] rounded-xl overflow-hidden bg-gray-100 shadow-sm cursor-pointer active:opacity-80 transition-opacity"
                              onClick={() =>
                                openLightbox(msg.attachments![0].file_url)
                              }
                            >
                              <Image
                                src={msg.attachments[0].file_url}
                                alt="Attachment"
                                fill
                                className="object-cover"
                                sizes="340px"
                                unoptimized={msg.attachments[0].file_url.startsWith(
                                  "blob:",
                                )}
                              />
                            </div>
                          ) : (
                            /* Multiple images - grid */
                            <div
                              className={cn(
                                "grid gap-1.5",
                                msg.attachments.length === 2
                                  ? "grid-cols-2 w-[280px] sm:w-[340px]"
                                  : msg.attachments.length === 3
                                    ? "grid-cols-2 w-[280px] sm:w-[340px]"
                                    : "grid-cols-2 w-[280px] sm:w-[340px]",
                              )}
                            >
                              {msg.attachments.map((att, attIdx) => (
                                <div
                                  key={att.id}
                                  className={cn(
                                    "relative rounded-xl overflow-hidden bg-gray-100 shadow-sm aspect-square cursor-pointer active:opacity-80 transition-opacity",
                                    msg.attachments!.length === 3 &&
                                      attIdx === 0 &&
                                      "col-span-2 aspect-[2/1]",
                                  )}
                                  onClick={() => openLightbox(att.file_url)}
                                >
                                  <Image
                                    src={att.file_url}
                                    alt="Attachment"
                                    fill
                                    className="object-cover"
                                    sizes="170px"
                                    unoptimized={att.file_url.startsWith(
                                      "blob:",
                                    )}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {msg.content && (
                        <div
                          className={cn(
                            "px-4 py-2 rounded-2xl break-words shadow-sm max-w-[280px] sm:max-w-[340px]",
                            isMe
                              ? "bg-[#F2F2F2] text-[#4A4A4A] rounded-br-[4px]"
                              : "bg-[#7C8F76] text-white rounded-bl-[4px]",
                          )}
                        >
                          <p
                            className={cn(
                              "text-[14px] sm:text-base leading-relaxed",
                              isPopup && "font-medium",
                            )}
                          >
                            {msg.content}
                          </p>
                        </div>
                      )}

                      <div
                        className={cn(
                          "flex items-center mt-1 text-[10px]",
                          isMe
                            ? "justify-end text-blue-400"
                            : "justify-start text-gray-400",
                        )}
                      >
                        <span>
                          {format(parseDate(msg.created_at), "HH:mm")}
                        </span>
                        {isMe && (
                          <span className="ml-1 flex items-center h-3">
                            {isLastReadMessage ? (
                              <>
                                <span className="mr-0.5">read</span>
                                <CheckCheck className="w-3 h-3" />
                              </>
                            ) : // 如果不是最後一則已讀，則根據 is_read 顯示雙勾或單勾
                            msg.is_read ? (
                              <CheckCheck className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {dateHeader}
                </React.Fragment>
              );
            })}
          </>
        )}
        {hasMore && (
          <div
            ref={loadMoreRef}
            className="h-10 flex items-center justify-center py-4"
          >
            {isFetchingMore && (
              <span className="text-xs text-gray-400">
                Loading older messages...
              </span>
            )}
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
                <Image
                  src={url}
                  alt="Preview"
                  fill
                  className="object-cover rounded-md border"
                />
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
            placeholder={
              isPopup ? "你好，我想索取這件物品" : "Type a message..."
            }
            className={cn(
              "flex-1",
              isPopup && "bg-[#F2F2F2] border-none rounded-full px-6",
            )}
            disabled={isSending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              isSending || (!inputValue.trim() && selectedFiles.length === 0)
            }
            className={cn(
              isPopup &&
                "bg-[#7C8F76] hover:bg-[#6A7B65] rounded-full w-10 h-10",
            )}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPopup ? (
              <ArrowUp className="w-5 h-5" />
            ) : (
              <SendIcon className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center overflow-hidden"
          onClick={handleLightboxTap}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Top bar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLightbox}
              className="text-white/80 hover:text-white p-2"
            >
              <X className="w-6 h-6" />
            </button>
            <span className="text-white/60 text-sm">
              {lightboxIndex + 1} / {lightboxUrls.length}
            </span>
            <button
              onClick={handleDownload}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Download className="w-6 h-6" />
            </button>
          </div>

          {/* Left arrow */}
          {lightboxIndex > 0 && (
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors hidden sm:block"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("prev");
              }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Right arrow */}
          {lightboxIndex < lightboxUrls.length - 1 && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors hidden sm:block"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("next");
              }}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* 3-image carousel strip */}
          <div
            className="relative w-full h-full max-h-[80vh] overflow-hidden"
            style={{ maxWidth: "90vw" }}
          >
            <div
              className="flex h-full"
              style={{
                width: "300%",
                transform: `translateX(${-33.33 + animOffset * 33.33}%)`,
                transition:
                  animOffset !== 0 ? "transform 0.3s ease-out" : "none",
              }}
            >
              {/* Prev image slot */}
              <div className="relative h-full" style={{ width: "33.33%" }}>
                {lightboxIndex > 0 && (
                  <Image
                    src={lightboxUrls[lightboxIndex - 1]}
                    alt="Previous"
                    fill
                    className="object-contain pointer-events-none select-none"
                    sizes="90vw"
                    unoptimized={lightboxUrls[lightboxIndex - 1].startsWith(
                      "blob:",
                    )}
                    draggable={false}
                  />
                )}
              </div>
              {/* Current image slot (with zoom) */}
              <div
                className="relative h-full"
                style={{
                  width: "33.33%",
                  transform: `scale(${zoomScale})`,
                  transition: "transform 0.2s ease-out",
                  touchAction: "none",
                }}
              >
                <Image
                  src={lightboxUrls[lightboxIndex]}
                  alt="Full size"
                  fill
                  className="object-contain pointer-events-none select-none"
                  sizes="90vw"
                  unoptimized={lightboxUrls[lightboxIndex].startsWith("blob:")}
                  priority
                  draggable={false}
                />
              </div>
              {/* Next image slot */}
              <div className="relative h-full" style={{ width: "33.33%" }}>
                {lightboxIndex < lightboxUrls.length - 1 && (
                  <Image
                    src={lightboxUrls[lightboxIndex + 1]}
                    alt="Next"
                    fill
                    className="object-contain pointer-events-none select-none"
                    sizes="90vw"
                    unoptimized={lightboxUrls[lightboxIndex + 1].startsWith(
                      "blob:",
                    )}
                    draggable={false}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
