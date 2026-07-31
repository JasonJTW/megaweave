// components/DrawerWrapper.tsx
"use client";

import DrawerList from "@/app/components/DrawerList";
import UserPostCard from "@/app/components/PostCard/UserPostCard";
import { usePost } from "@/app/contexts/PostContext";
import type { Condition, Post } from "@/app/types/schema";
import type { Weave } from "@/services/weaveService";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

interface DrawerWrapperProps {
  weaves?: Weave[];
  userPosts: Post[];
  conditions: Condition[];
  currentUserId: number;
  fetchWeaves?: () => void;
  fetchStats?: () => void | Promise<void>;
}

const DrawerWrapper: React.FC<DrawerWrapperProps> = ({
  weaves,
  userPosts,
  conditions,
  currentUserId,
  fetchWeaves,
}) => {
  // 💥 只有在這個 Client Component 內才呼叫 useSearchParams
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightWeaveId = searchParams.get("highlightWeaveId");
  const { categories } = usePost();

  const parsedHighlightId = highlightWeaveId
    ? Number(highlightWeaveId)
    : undefined;

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr] sm:gap-6">
        <div className="min-w-0">
          <DrawerList
            title="Weaving"
            posts={[]}
            weaves={weaves}
            conditions={conditions}
            currentUserId={currentUserId}
            highlightWeaveId={parsedHighlightId}
            fetchWeaves={fetchWeaves}
            onWeaveStatusChange={fetchWeaves}
          />
        </div>
        <div className="min-w-0">
          <div className="type-h3 mx-4 my-5 flex items-center justify-between px-4 py-2 font-ddin text-megaweave-forest-dark">
            <div>Posts</div>
          </div>

          <div className="grid grid-cols-2 justify-items-center gap-5 px-4 sm:grid-cols-2 sm:px-0 md:grid-cols-3 lg:grid-cols-4">
            {userPosts.map((p, i) => (
              <div key={`post-${p.id}`}>
                <UserPostCard
                  post={p}
                  conditions={conditions}
                  categories={categories}
                  onPostClick={() => router.push(`/item/${p.id}`)}
                  isExpanded={true}
                  isFirstVisible={i === 0}
                  currentUserId={currentUserId}
                />
              </div>
            ))}
          </div>
        </div>
        {/* <div className="min-w-0">
          <DrawerList
            title="Share"
            posts={sharePosts}
            conditions={conditions}
            fetchWeaves={fetchStats}
          />
        </div> */}
      </div>
      {/*    <DrawerList
        title="Wish"
        posts={wishPosts}
        conditions={conditions}
        fetchWeaves={fetchStats}
      /> */}
    </>
  );
};

export default DrawerWrapper;
