"use client";

import CompactPostCard from "@/app/components/PostCard/CompactPostCard";
import WeavingIcon from "@/app/components/icons/WeavingIcon";
import { useUser } from "@/app/contexts/UserContext";
import type { Post } from "@/app/types/schema";
import { ArrowLeft, Clock, LucideLoader2, LucideRefreshCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface HistoryResponse {
  posts: (Post & { viewed_at?: string })[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalPosts: number;
    postsPerPage: number;
  };
}

export default function HistoryPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const [posts, setPosts] = useState<(Post & { viewed_at?: string })[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Authentication guard
  useEffect(() => {
    if (!userLoading && !user) {
      toast.error("Please sign in to view your history");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
      );
    }
  }, [userLoading, user, router]);

  const fetchHistory = useCallback(
    async (page: number, append: boolean = false) => {
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }

        const res = await fetch(
          `${hostName}/api/posts/history?page=${page}&limit=20`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch viewing history");
        }

        const data: HistoryResponse = await res.json();

        if (append) {
          setPosts((prev) => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts || []);
        }

        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalPosts(data.pagination.totalPosts);
      } catch (err) {
        console.error("Error fetching history:", err);
        toast.error("Failed to load viewing history");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (user) {
      fetchHistory(1);
    }
  }, [user, fetchHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchHistory(1);
  };

  const handleLoadMore = () => {
    if (currentPage < totalPages && !isLoadingMore) {
      fetchHistory(currentPage + 1, true);
    }
  };

  if (userLoading || (isLoading && posts.length === 0)) {
    return (
      <div className="min-h-screen bg-[#f5f4f3] px-4 pb-16 pt-8 font-ddin">
        <div className="mx-auto max-w-6xl">
          {/* Header Skeleton */}
          <div className="mb-8 flex items-center justify-between">
            <div className="h-9 w-48 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
          </div>

          {/* Cards Skeleton Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex gap-3 rounded-[20px] bg-white p-2.5 shadow-sm"
              >
                <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-[14px] bg-gray-200" />
                <div className="flex flex-1 flex-col justify-between py-1">
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
                  </div>
                  <div className="h-3 w-1/4 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f5f4f3] px-4 pb-16 pt-8 font-ddin">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-megaweave-forest"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-megaweave-forest-dark sm:text-3xl">
                Viewing History
              </h1>
              <p className="text-sm text-gray-500">
                {totalPosts > 0
                  ? `${totalPosts} posts viewed`
                  : "Posts you recently browsed"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-megaweave-forest disabled:opacity-50"
              aria-label="Refresh viewing history"
            >
              <LucideRefreshCcw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin text-megaweave-forest" : ""}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content */}
        {posts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {posts.map((post) => (
                <CompactPostCard
                  key={`history-${post.id}`}
                  post={post}
                  viewedAt={post.viewed_at}
                />
              ))}
            </div>

            {/* Load More Button */}
            {currentPage < totalPages && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 font-bold text-megaweave-forest shadow-sm transition hover:bg-white/90 hover:shadow disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <LucideLoader2 className="h-4 w-4 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load More</span>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="mt-12 flex flex-col items-center justify-center rounded-[24px] bg-white px-6 py-16 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50 text-megaweave-forest">
              <Clock className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-gray-900">
              No viewing history yet
            </h2>
            <p className="mb-6 max-w-md text-sm text-gray-500">
              Explore posts on Megaweave to discover shared items, wishes, and
              community stories. Your browsing history will appear here.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              <WeavingIcon className="h-4 w-4" />
              <span>Explore Posts</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
