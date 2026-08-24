"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import { useRouter } from "next/navigation";
import { useUser } from "../../contexts/UserContext";
import { useLocation } from "../../contexts/LocationContext";
import type { Post, PostsResponse } from "../../types/schema";
import TinderCard from "./TinderCard";
import {
  X,
  Heart,
  RotateCcw,
  Info,
  MessageCircle,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

interface SwipeHistoryItem {
  post: Post;
  direction: "left" | "right";
}

export default function TinderFeed() {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";
  const { user } = useUser();
  const { coords } = useLocation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<SwipeHistoryItem[]>([]);
  const [forcedDirection, setForcedDirection] = useState<
    "left" | "right" | null
  >(null);
  const [isMessaging, setIsMessaging] = useState(false);
  // Track liked post IDs client-side so reload doesn't lose the liked state
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  // SWR Infinite fetcher for personal recommendation feed
  const getKey = useCallback(
    (pageIndex: number, previousPageData: PostsResponse | null) => {
      if (previousPageData && !previousPageData.posts.length) return null;
      const params = new URLSearchParams({
        page: (pageIndex + 1).toString(),
        limit: "12",
      });
      if (coords?.lat !== undefined && coords?.lng !== undefined) {
        params.append("lat", coords.lat.toString());
        params.append("lng", coords.lng.toString());
      }
      return `${hostName}/api/posts/feed?${params.toString()}`;
    },
    [hostName, coords?.lat, coords?.lng],
  );

  const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((res) => res.json());

  const { data, setSize, isValidating, mutate } = useSWRInfinite<PostsResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
    },
  );

  // Flatten posts and deduplicate
  const posts = useMemo(() => {
    if (!data) return [];
    const allPosts: Post[] = [];
    const seenIds = new Set<number>();

    for (const page of data) {
      if (!page?.posts) continue;
      for (const p of page.posts) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allPosts.push(p);
        }
      }
    }
    return allPosts;
  }, [data]);

  const pagination = data ? data[data.length - 1]?.pagination : null;
  const hasMore = pagination
    ? pagination.currentPage < pagination.totalPages
    : false;

  // Auto-prefetch next batch when remaining cards in queue are few
  useEffect(() => {
    if (posts.length > 0 && currentIndex >= posts.length - 4 && hasMore) {
      setSize((prev) => prev + 1);
    }
  }, [currentIndex, posts.length, hasMore, setSize]);

  // Handle Swipe Action (Left = Pass / 不加分, Right = Like / 加分)
  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (currentIndex >= posts.length) return;

      const currentPost = posts[currentIndex];
      setHistory((prev) => [...prev, { post: currentPost, direction }]);

      // Update index immediately — callers are responsible for animation timing
      setCurrentIndex((prev) => prev + 1);
      setForcedDirection(null);

      // 右滑加分邏輯 (Like API)
      // 若貼文已 liked（來自 API 或本次操作），跳過 API（防止 toggle endpoint 把讚取消）
      if (direction === "right") {
        const alreadyLiked = currentPost.is_liked || likedIds.has(currentPost.id);
        if (alreadyLiked) {
          toast("已加分過囉！", { icon: "💚", duration: 1500 });
        } else if (user) {
          try {
            await fetch(`${hostName}/api/posts/${currentPost.id}/like`, {
              method: "POST",
              credentials: "include",
            });
            setLikedIds((prev) => new Set(prev).add(currentPost.id));
            toast.success("加分成功！", {
              icon: "💚",
              duration: 1500,
            });
          } catch (err) {
            console.error("Error liking post:", err);
          }
        } else {
          toast.success("已加分！", {
            icon: "💚",
            duration: 1500,
          });
        }
      }
    },
    [currentIndex, posts, user, hostName, likedIds],
  );

  // Programmatic swipe buttons (button-triggered: set forcedDirection for animation, delay index update)
  const triggerSwipe = (direction: "left" | "right") => {
    if (forcedDirection !== null || currentIndex >= posts.length) return;
    setForcedDirection(direction);
    // Delay handleSwipe so the exit animation (~380ms) plays before index updates
    setTimeout(() => {
      handleSwipe(direction);
    }, 380);
  };

  // Undo last card
  const handleUndo = useCallback(() => {
    if (history.length === 0 || currentIndex === 0) return;

    const lastItem = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setForcedDirection(null);

    // 若 undo 的是右滑，且該貼文原本未 liked（非 is_liked 且不在 likedIds），才呼叫 unlike toggle
    if (lastItem.direction === "right" && user && !lastItem.post.is_liked && likedIds.has(lastItem.post.id)) {
      fetch(`${hostName}/api/posts/${lastItem.post.id}/like`, {
        method: "POST",
        credentials: "include",
      }).catch((err) => console.error("Error reverting like:", err));
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(lastItem.post.id);
        return next;
      });
    }

    toast("已復原上一則貼文", { icon: "↩️", duration: 1500 });
  }, [history, currentIndex, user, hostName, likedIds]);

  // Navigate to post detail
  const handleDetail = useCallback(
    (post: Post) => {
      router.push(`/item/${post.id}`);
    },
    [router],
  );

  // Message author
  const handleMessage = useCallback(
    async (post: Post) => {
      if (!user) {
        toast.error("請先登入以發送私訊");
        router.push(
          `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
        );
        return;
      }

      if (!post.author_public_id) {
        toast.error("無法取得作者資訊");
        return;
      }

      setIsMessaging(true);
      try {
        const res = await fetch(`${hostName}/api/messages/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recipient_public_id: post.author_public_id }),
        });

        if (!res.ok) {
          throw new Error("Failed to start message");
        }

        const data = await res.json();
        router.push(`/messages/${data.conversationId}`);
      } catch (error) {
        console.error("Message error:", error);
        toast.error("無法開啟對話");
      } finally {
        setIsMessaging(false);
      }
    },
    [user, router, hostName],
  );

  // Reload / reset feed
  const handleReload = () => {
    setCurrentIndex(0);
    setHistory([]);
    setLikedIds(new Set());
    setForcedDirection(null);
    mutate();
  };

  const currentPost = posts[currentIndex];
  const isLoadingInitial = isValidating && (!data || data.length === 0);
  const isOutOfCards = posts.length > 0 && currentIndex >= posts.length;

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-64px)] w-full max-w-md select-none flex-col items-center justify-between px-3 pb-4 pt-2 sm:px-4 sm:pb-6">
      {/* ─── Card Stack Deck Area ─── */}
      <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-visible">
        {isLoadingInitial ? (
          /* Loading Skeleton */
          <div className="relative flex h-full max-h-[640px] w-full animate-pulse flex-col justify-between overflow-hidden rounded-[28px] border border-stone-200 bg-[#1e231d] p-6 shadow-xl">
            <div className="flex justify-between">
              <div className="h-6 w-24 rounded-full bg-stone-700" />
              <div className="h-6 w-16 rounded-full bg-stone-700" />
            </div>
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-stone-500">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
              <p className="font-ddin text-sm font-semibold tracking-wider text-stone-400">
                Loading Feed...
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-6 w-3/4 rounded bg-stone-700" />
              <div className="h-4 w-1/2 rounded bg-stone-800" />
            </div>
          </div>
        ) : isOutOfCards ? (
          /* All Caught Up / Empty State */
          <div className="relative flex h-full max-h-[640px] w-full flex-col items-center justify-center overflow-hidden rounded-[28px] border border-stone-200/60 bg-gradient-to-b from-white to-stone-50 p-8 text-center shadow-xl">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner">
              <Sparkles className="h-10 w-10 animate-bounce text-emerald-500" />
            </div>
            <h3 className="font-ddin text-2xl font-bold text-gray-900">
              全部瀏覽完畢！
            </h3>
            <p className="mt-2 max-w-xs font-ddin text-sm text-stone-500">
              您已滑過目前所有的推薦貼文，可以點擊下方按鈕重新載入或稍後再回來查看最新分享。
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
              <Button
                onClick={handleReload}
                className="flex items-center justify-center gap-2 bg-megaweave-forest text-white hover:bg-megaweave-forest-dark"
              >
                <RefreshCw className="h-4 w-4" /> 重新整理推薦
              </Button>
              {history.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleUndo}
                  className="flex items-center justify-center gap-2 border-stone-300 text-stone-700"
                >
                  <RotateCcw className="h-4 w-4" /> 查看上一張
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Card Stack (Render up to 3 cards for depth) */
          <div className="relative h-full max-h-[640px] w-full">
            {posts
              .slice(currentIndex, currentIndex + 3)
              .map((post, relativeIndex) => {
                const isTop = relativeIndex === 0;
                return (
                  <TinderCard
                    key={post.id}
                    post={post}
                    isTop={isTop}
                    indexInStack={relativeIndex}
                    onSwipe={handleSwipe}
                    onDetailClick={handleDetail}
                    forcedDirection={isTop ? forcedDirection : null}
                  />
                );
              })
              .reverse()}
          </div>
        )}
      </div>

      {/* ─── Bottom Action Control Bar ─── */}
      <div className="mt-3 flex w-full max-w-xs items-center justify-between px-2 pb-0.5 pt-1">
        {/* Undo Button */}
        <button
          onClick={handleUndo}
          disabled={history.length === 0 || currentIndex === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-100 bg-white text-amber-500 shadow-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="Undo"
        >
          <RotateCcw className="h-5 w-5 stroke-[2.5]" />
        </button>

        {/* Pass / 不加分 (Left Swipe) */}
        <button
          onClick={() => triggerSwipe("left")}
          disabled={isOutOfCards || isLoadingInitial}
          className="h-15 w-15 flex items-center justify-center rounded-full border border-rose-100 bg-white text-rose-500 shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="Pass / 不加分"
        >
          <X className="h-7 w-7 stroke-[3]" />
        </button>

        {/* Info / Detail Button */}
        <button
          onClick={() => currentPost && handleDetail(currentPost)}
          disabled={isOutOfCards || isLoadingInitial}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-sky-100 bg-white text-sky-600 shadow-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="Post Info"
        >
          <Info className="h-5 w-5 stroke-[2.5]" />
        </button>

        {/* Like / 加分 (Right Swipe) */}
        <button
          onClick={() => triggerSwipe("right")}
          disabled={isOutOfCards || isLoadingInitial}
          className="h-15 w-15 flex items-center justify-center rounded-full border border-emerald-100 bg-white text-emerald-500 shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="Like / 加分"
        >
          <Heart className="h-7 w-7 fill-emerald-500 stroke-emerald-500" />
        </button>

        {/* Message / Chat Button */}
        <button
          onClick={() => currentPost && handleMessage(currentPost)}
          disabled={isOutOfCards || isLoadingInitial || isMessaging}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-teal-100 bg-white text-teal-600 shadow-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          aria-label="Message Author"
        >
          <MessageCircle className="h-5 w-5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
