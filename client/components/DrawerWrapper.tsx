// components/DrawerWrapper.tsx
"use client";

import { useSearchParams } from "next/navigation";
import React from "react";
import Drawer from "@/app/components/Drawer"; // 假設您的 Drawer 元件在這個路徑下
import type { Weave } from "@/services/weaveService";
import type { Condition, Post } from "@/app/types/schema";

interface DrawerWrapperProps {
  weaves?: Weave[];
  sharePosts: Post[];
  wishPosts: Post[];
  conditions: Condition[];
  currentUserId: number;
}

const DrawerWrapper: React.FC<DrawerWrapperProps> = ({
  weaves,
  sharePosts,
  wishPosts,
  conditions,
  currentUserId,
}) => {
  // 💥 只有在這個 Client Component 內才呼叫 useSearchParams
  const searchParams = useSearchParams();
  const highlightWeaveId = searchParams.get("highlightWeaveId");

  const parsedHighlightId = highlightWeaveId
    ? Number(highlightWeaveId)
    : undefined;

  return (
    <>
      <Drawer
        title="Weaving"
        posts={[]}
        weaves={weaves}
        conditions={conditions}
        currentUserId={currentUserId}
        highlightWeaveId={parsedHighlightId} // 傳遞給 Weaving Drawer
      />
      {/* 其他 Drawer 不處理 highlight 邏輯 */}
      <Drawer title="Share" posts={sharePosts} conditions={conditions} />
      <Drawer title="Wish" posts={wishPosts} conditions={conditions} />
    </>
  );
};

export default DrawerWrapper;
