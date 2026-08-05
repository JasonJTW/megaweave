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
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { compressImage } from "@/utils/imageProcessor";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import WeavingCard from "@/app/components/WeavingCard";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightWeaveId = searchParams.get("highlightWeaveId");

  const { messages, conversation, isLoading, mutate, fetchMore, hasMore } =
    useMessages(conversationId);
  const { mutate: globalMutate } = useSWRConfig();
  useChatSocket(conversationId);

  // Auto-scroll to highlighted WeavingCard if highlightWeaveId query param exists
  useEffect(() => {
    if (!highlightWeaveId || isLoading) return;

    const timer = setTimeout(() => {
      const targetElement = document.getElementById(
        `weave-card-${highlightWeaveId}`,
      );
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [highlightWeaveId, isLoading]);

  const handleAvatarClick = () => {
    if (otherUser?.public_id) {
      router.push(`/profile/${otherUser.public_id}`);
    }
  };

  // Consume pendingItem from global context — represents the weaving intent
  // before the user sends their first real message.
  const {
    pendingItem,
    setPendingItem,
    post,
    conversationId: popupConvId,
  } = useChatPopup();
  // ponytail: activePost only used for optimistic banner, same conv check
  const activePost = popupConvId === conversationId ? post : null;

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
        if (post && post.id) {
          formData.append("post_id", String(post.id));
        }
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
        "flex h-full flex-col bg-white",
        isPopup && "rounded-t-[40px]",
      )}
    >
      {/* Header - Hidden in popup because ChatPopup handles it */}
      {!isPopup && (
        <div className="flex items-center border-b p-4">
          <Link href="/messages" className="mr-3 md:hidden">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <Avatar
            className="mr-3 h-10 w-10 cursor-pointer"
            onClick={handleAvatarClick}
          >
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
          "flex min-w-0 flex-1 flex-col-reverse gap-4 overflow-y-auto bg-slate-50 p-4",
        )}
      >
        {/* Anchor point for scrolling to bottom */}
        <div ref={messagesEndRef} />

        {/* Optimistic "Start weaving" banner — shows at the visual bottom of the
            chat (near the input box) while the user is composing their first
            message. Disappears once the message is sent. */}
        {pendingItem &&
          (() => {
            let optimisticIsGiver = false;
            if (activePost && currentUser) {
              const isPostAuthor =
                activePost.author_public_id === currentUser.public_id;
              optimisticIsGiver =
                activePost.type === "share" || activePost.type === "commons"
                  ? isPostAuthor
                  : !isPostAuthor;
            }
            const optimisticBannerText = activePost
              ? optimisticIsGiver
                ? activePost.type === "wish"
                  ? `Start weaving to offer ${pendingItem.title ? `for ${pendingItem.title}` : ""}`.trim()
                  : `Start weaving to give ${pendingItem.title ? `for ${pendingItem.title}` : ""}`.trim()
                : `Start weaving to request ${pendingItem.title ? `for ${pendingItem.title}` : ""}`.trim()
              : `Start weaving for ${pendingItem.title}`;
            return (
              <div className="my-2 flex w-full min-w-0 items-center justify-center gap-4 py-4">
                <div className="h-[1px] flex-1 border-t border-dashed border-gray-300" />
                <p className="min-w-0 max-w-[70%] font-ddin text-[16px] font-bold text-[#9EB098]">
                  {optimisticBannerText}
                </p>
                <div className="h-[1px] flex-1 border-t border-dashed border-gray-300" />
              </div>
            );
          })()}

        {isLoading ? (
          <div className="mt-10 text-center text-gray-400">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="mb-10 flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Avatar
                className="h-12 w-12 cursor-pointer"
                onClick={handleAvatarClick}
              >
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
                  className="my-4 flex justify-center"
                >
                  <span className="rounded-full bg-gray-200 px-2 py-1 text-xs uppercase text-gray-500">
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
                let currentItemId = null;
                let postType: string | null = null;
                let postAuthorPublicId: string | null = null;

                try {
                  const metadata =
                    typeof msg.metadata === "string"
                      ? JSON.parse(msg.metadata)
                      : msg.metadata;
                  itemTitle = metadata?.item_title || "";
                  quantity = metadata?.quantity || 1;
                  const cloudfrontCDN =
                    process.env.NEXT_PUBLIC_CLOUDFRONT_CDN || "";
                  imageUrl = metadata?.image_s3_key
                    ? `${cloudfrontCDN}/${metadata.image_s3_key}`
                    : "";
                  weaveId = metadata?.weave_id || null;
                  currentItemId = metadata?.item_id || null;
                  postType = metadata?.post_type || null;
                  postAuthorPublicId = metadata?.post_author_public_id || null;
                } catch {
                  // Ignore parse error
                }

                // Determine role from metadata — no async fetch needed
                const isPostAuthor =
                  postAuthorPublicId === currentUser?.public_id;
                const isGiver = postType
                  ? postType === "share" || postType === "commons"
                    ? isPostAuthor
                    : !isPostAuthor
                  : false;

                const bannerText = postType
                  ? isGiver
                    ? postType === "wish"
                      ? `Start weaving to offer for ${itemTitle}`.trim()
                      : `Start weaving to give for ${itemTitle}`.trim()
                    : `Start weaving to request for ${itemTitle}`.trim()
                  : `Start weaving ${itemTitle ? `for ${itemTitle}` : "!"}`;

                // Only show banner for the first occurrence per item
                const hasOlderStartWeaving = messages
                  .slice(index + 1)
                  .some((m) => {
                    if (m.message_type !== "system_start_weaving") return false;
                    try {
                      const mMeta =
                        typeof m.metadata === "string"
                          ? JSON.parse(m.metadata)
                          : m.metadata;
                      return String(mMeta?.item_id) === String(currentItemId);
                    } catch {
                      return false;
                    }
                  });

                const shouldShowBanner = !weaveId || !hasOlderStartWeaving;
                const shouldShowCard = !!weaveId;

                return (
                  <React.Fragment key={msg.id}>
                    <div className="flex w-full min-w-0 flex-col items-center">
                      {shouldShowBanner && (
                        <div className="my-2 flex w-full min-w-0 items-center justify-center gap-4 py-4">
                          <div className="h-[1px] flex-1 border-t border-dashed border-gray-300" />
                          <p className="min-w-0 max-w-[70%] font-ddin text-[16px] font-bold text-[#9EB098]">
                            {bannerText}
                          </p>
                          <div className="h-[1px] flex-1 border-t border-dashed border-gray-300" />
                        </div>
                      )}
                      {shouldShowCard && (
                        <div id={`weave-card-${weaveId}`} className="w-full">
                          <WeavingCard
                            currentUserId={currentUser?.userId}
                            isHighlighted={
                              String(weaveId) === String(highlightWeaveId)
                            }
                            inChatWindow={{
                              itemTitle,
                              quantity,
                              imageUrl: imageUrl || undefined,
                              weaveId: weaveId!,
                              isGiver,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    {dateHeader}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={msg.id}>
                  <div
                    className={cn(
                      "mb-4 flex w-full",
                      isMe ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isMe && (
                      <Avatar
                        className="mr-2 mt-1 h-8 w-8 cursor-pointer"
                        onClick={handleAvatarClick}
                      >
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
                              className="relative h-[210px] w-[280px] cursor-pointer overflow-hidden rounded-xl bg-gray-100 shadow-sm transition-opacity active:opacity-80 sm:h-[255px] sm:w-[340px]"
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
                                  ? "w-[280px] grid-cols-2 sm:w-[340px]"
                                  : msg.attachments.length === 3
                                    ? "w-[280px] grid-cols-2 sm:w-[340px]"
                                    : "w-[280px] grid-cols-2 sm:w-[340px]",
                              )}
                            >
                              {msg.attachments.map((att, attIdx) => (
                                <div
                                  key={att.id}
                                  className={cn(
                                    "relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-gray-100 shadow-sm transition-opacity active:opacity-80",
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
                            "max-w-[280px] break-words rounded-2xl px-4 py-2 shadow-sm sm:max-w-[340px]",
                            isMe
                              ? "rounded-br-[4px] bg-[#F2F2F2] text-[#4A4A4A]"
                              : "rounded-bl-[4px] bg-[#7C8F76] text-white",
                          )}
                        >
                          <p
                            className={cn(
                              "text-[14px] leading-relaxed sm:text-base",
                              isPopup && "font-medium",
                            )}
                          >
                            {msg.content}
                          </p>
                        </div>
                      )}

                      <div
                        className={cn(
                          "mt-1 flex items-center text-[10px]",
                          isMe
                            ? "justify-end text-blue-400"
                            : "justify-start text-gray-400",
                        )}
                      >
                        <span>
                          {format(parseDate(msg.created_at), "HH:mm")}
                        </span>
                        {isMe && (
                          <span className="ml-1 flex h-3 items-center">
                            {isLastReadMessage ? (
                              <>
                                <span className="mr-0.5">read</span>
                                <CheckCheck className="h-3 w-3" />
                              </>
                            ) : // 如果不是最後一則已讀，則根據 is_read 顯示雙勾或單勾
                            msg.is_read ? (
                              <CheckCheck className="h-3 w-3" />
                            ) : (
                              <Check className="h-3 w-3" />
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
            className="flex h-10 items-center justify-center py-4"
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
          <div className="flex gap-2 overflow-x-auto border-b bg-gray-50 p-2">
            {previews.map((url, i) => (
              <div key={url} className="group relative h-20 w-20 flex-shrink-0">
                <Image
                  src={url}
                  alt="Preview"
                  fill
                  className="rounded-md border object-cover"
                />
                <button
                  onClick={() => removeSelectedImage(i)}
                  className="absolute -right-2 -top-2 rounded-full bg-red-500 p-0.5 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2 p-4">
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
            <ImageIcon className="h-6 w-6" />
          </Button>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              isPopup
                ? "Hi! I'd like to request this item."
                : "Type a message..."
            }
            className={cn(
              "flex-1",
              isPopup && "rounded-full border-none bg-[#F2F2F2] px-6",
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
                "h-10 w-10 rounded-full bg-[#7C8F76] hover:bg-[#6A7B65]",
            )}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPopup ? (
              <ArrowUp className="h-5 w-5" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black/90"
          onClick={handleLightboxTap}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Top bar */}
          <div
            className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLightbox}
              className="p-2 text-white/80 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-sm text-white/60">
              {lightboxIndex + 1} / {lightboxUrls.length}
            </span>
            <button
              onClick={handleDownload}
              className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Download className="h-6 w-6" />
            </button>
          </div>

          {/* Left arrow */}
          {lightboxIndex > 0 && (
            <button
              className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:block"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("prev");
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}

          {/* Right arrow */}
          {lightboxIndex < lightboxUrls.length - 1 && (
            <button
              className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:block"
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox("next");
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}

          {/* 3-image carousel strip */}
          <div
            className="relative h-full max-h-[80vh] w-full overflow-hidden"
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
                    className="pointer-events-none select-none object-contain"
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
                  className="pointer-events-none select-none object-contain"
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
                    className="pointer-events-none select-none object-contain"
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
