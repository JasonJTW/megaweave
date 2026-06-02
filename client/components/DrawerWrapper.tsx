// components/DrawerWrapper.tsx
"use client";

import { useSearchParams } from "next/navigation";
import React from "react";
import DrawerList from "@/app/components/DrawerList";
import type { Weave } from "@/services/weaveService";
import type { Condition, Post } from "@/app/types/schema";

interface DrawerWrapperProps {
  weaves?: Weave[];
  sharePosts: Post[];
  wishPosts: Post[];
  conditions: Condition[];
  currentUserId: number;
  fetchWeaves?: () => void;
  fetchStats?: () => void | Promise<void>;
}

const DrawerWrapper: React.FC<DrawerWrapperProps> = ({
  weaves,
  sharePosts,
  wishPosts,
  conditions,
  currentUserId,
  fetchWeaves,
  fetchStats,
}) => {
  // 💥 只有在這個 Client Component 內才呼叫 useSearchParams
  const searchParams = useSearchParams();
  const highlightWeaveId = searchParams.get("highlightWeaveId");

  const parsedHighlightId = highlightWeaveId
    ? Number(highlightWeaveId)
    : undefined;

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div className="min-w-0">
          <DrawerList
            title="Weaving"
            posts={[]}
            weaves={weaves}
            conditions={conditions}
            currentUserId={currentUserId}
            highlightWeaveId={parsedHighlightId}
            fetchWeaves={fetchWeaves}
          />
        </div>
        <div className="min-w-0">
          <DrawerList
            title="Share"
            posts={sharePosts}
            conditions={conditions}
            fetchWeaves={fetchStats}
          />
        </div>
      </div>
      <DrawerList
        title="Wish"
        posts={wishPosts}
        conditions={conditions}
        fetchWeaves={fetchStats}
      />
    </>
  );
};

export default DrawerWrapper;
