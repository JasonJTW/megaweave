// components/Comment/CommentSection.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Post } from "../../types/schema";
import User from "../../types/user";
import CommentCard from "./CommentCard";
import CommentInput from "./CommentInput";
import CommentItem from "./CommentItem";
import { createWeave } from "@/services/weaveService";
import { useRouter } from "next/navigation";
// ✅ 引入 WeavingInput
import WeavingInput from "./WeavingInput";
import toast from "react-hot-toast";
import { useChatPopup } from "@/app/contexts/ChatPopupContext";
import {
  Comment,
  getComments,
  getCommentCounts,
} from "@/services/commentService";

interface CommentSectionProps {
  post: Post;
  user: User | null;
}

type TabKey = "all" | number;

const CommentSection: React.FC<CommentSectionProps> = ({ post, user }) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { openChat } = useChatPopup();
  // ✅ 新增：追蹤哪個 Tab 正在顯示 WeavingInput
  const [weavingInputItem, setWeavingInputItem] = useState<TabKey | null>(null);

  const handlePrivateMessage = async (tab: { key: TabKey; title: string }) => {
    if (!user) {
      toast.error("Please log in to message.");
      router.push("/signin");
      return;
    }

    if (user.userId === post.author_user_id) {
      toast.error("You cannot message yourself.");
      return;
    }

    try {
      const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
      
      const requestBody: { recipient_public_id: string; item_id?: number | string; post_title?: string } = { recipient_public_id: post.author_public_id };
      if (tab.key !== 'all') {
          requestBody.item_id = tab.key;
          requestBody.post_title = tab.title;
      } else {
          // If it's the main post, we can use the post ID or title
          // Currently, let's just pass the post title for context
          requestBody.post_title = post.title;
      }

      const res = await fetch(`${hostName}/api/messages/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error("Failed to start conversation");

      const data = await res.json();
      console.log("data: ", data);
      openChat(data.conversationId, {
        public_id: post.author_public_id,
        username: post.username,
        avatar_url: post.avatar_url,
      });
    } catch (error) {
      console.error("Message error:", error);
      toast.error(`Could not message ${post.username}`);
    }
  };

  // 取得留言數量（初始載入）
  const fetchCounts = useCallback(async () => {
    try {
      const res = await getCommentCounts(post.id);
      setCounts(res.counts);
    } catch (err: unknown) {
      console.error("Error fetching counts:", err);
    }
  }, [post.id]);

  // 取得特定 tab 的留言
  const fetchCommentsByTab = useCallback(
    async (tab: TabKey) => {
      try {
        setIsLoading(true);
        const res = await getComments(post.id, tab);
        setComments(res.comments);
      } catch (err: unknown) {
        if (err instanceof Error) {
          toast.error(err.message);
        } else {
          toast.error("Error fetching comments");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [post.id],
  );

  // 初始載入留言數量
  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // 當 activeTab 改變時，載入該 tab 的留言
  useEffect(() => {
    if (activeTab !== null) {
      fetchCommentsByTab(activeTab);
    }
  }, [activeTab, fetchCommentsByTab]);

  // Deep linking logic
  useEffect(() => {
    const handleDeepLink = async () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#comment-")) {
        const commentId = hash.substring(9); // remove '#comment-'
        try {
          // Fetch comment to get item_id
          const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
          const res = await fetch(`${hostName}/api/comments/${commentId}`);
          if (res.ok) {
            const data = await res.json();
            const itemId = data.comment.item_id;
            const targetTab = itemId === null ? "all" : itemId;

            setActiveTab(targetTab);

            // Wait for comments to load and render, then scroll
            // We need to poll or use a ref mechanism, but a simple timeout works for now
            // better: relying on 'comments' dependency in another effect
          }
        } catch (e) {
          console.error("Deep link failed", e);
        }
      }
    };

    handleDeepLink();
  }, []);

  // Scroll to hash when comments are updated
  useEffect(() => {
    if (!isLoading && activeTab !== null) {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#comment-")) {
        const id = hash.substring(1);
        // Check if element exists
        setTimeout(() => {
          const element = document.getElementById(id);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add(
              "bg-yellow-50",
              "transition-colors",
              "duration-1000",
            );
            setTimeout(() => element.classList.remove("bg-yellow-50"), 2000);
          }
        }, 300); // delay after render
      }
    }
  }, [isLoading, comments, activeTab]);

  // 處理 tab 點擊
  const handleTabClick = (tab: TabKey) => {
    if (activeTab === tab) {
      setActiveTab(null);
      // 關閉 Tab 時，隱藏 Weaving Input
      setWeavingInputItem(null);
    } else {
      setActiveTab(tab);
      // 切換 Tab 時，隱藏 Weaving Input
      setWeavingInputItem(null);
    }
  };

  // 新增留言成功後重新載入
  const handleCommentSuccess = () => {
    fetchCounts();
    if (activeTab !== null) {
      fetchCommentsByTab(activeTab);
    }
    // 成功發送索取後，關閉索取輸入框
    setWeavingInputItem(null);
  };

  // ✅ 處理 Weaving Icon 點擊 (開啟索取輸入框)
  const handleWeavingIconClick = (tabKey: TabKey) => {
    // 1. 如果 Tab 沒開，先展開 Tab
    if (activeTab !== tabKey) {
      setActiveTab(tabKey);
    }
    // 2. 顯示 Weaving Input
    setWeavingInputItem(tabKey);
  };

  // ✅ 處理索取留言的提交邏輯
  const handleWeavingSubmit = async (
    tabKey: TabKey,
    quantity: number | "all",
  ) => {
    //* check login
    if (!user) {
      toast.error("Please log in to request items.");
      return;
    }

    // 防止自己索取自己的文章 (雖然前端檢查了，後端 weaves.ts 也會擋，但前端擋住體驗較好)
    if (user.userId === post.author_user_id) {
      // 假設 user 物件裡有 id，post 裡有 user_id
      toast.error("You cannot request your own items.");
      return;
    }
    try {
      // 1. 轉換 itemId
      // 如果 tabKey 是 "all" 字串，後端對應為 null；否則就是具體的 item id (number)
      const targetItemId = tabKey === "all" ? null : (tabKey as number);

      // 2. 轉換 quantity
      // 如果前端回傳 "all" (字串)，代表是針對整篇貼文的索取，後端數量記為 1
      // 如果是具體數字，則直接使用
      const targetQuantity = typeof quantity === "number" ? quantity : 1;

      // 3. 發送請求 (使用 fetch)
      const newWeave = await createWeave({
        postId: post.id,
        itemId: targetItemId,
        quantity: targetQuantity,
        // notes: "..." // 如果未來你有輸入備註的需求，可以加在這裡
      });
      console.log("newWeave:", newWeave);
      router.push(`/user?highlightWeaveId=${newWeave.weaveId}`);
      // 4. 成功處理
      toast.success("Request sent successfully!"); // 建議未來改用 Toast 元件
      handleCommentSuccess(); // 重新整理列表並關閉輸入框
    } catch (err: unknown) {
      console.error("Error creating weave:", err);
      // 顯示錯誤訊息 (例如庫存不足、文章非 active 等)
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("An unexpected error occurred.");
      }
    }
  };
  // 取得特定 tab 的留言列表
  const getTabComments = (tab: TabKey): Comment[] => {
    const key = tab === "all" ? "all" : `item_${tab}`;
    return comments[key] || [];
  };

  // 取得特定 tab 的留言數
  const getCount = (tab: TabKey): number => {
    const key = tab === "all" ? "all" : `item_${tab}`;
    return counts[key] || 0;
  };

  // Tab 列表
  const tabs: { key: TabKey; title: string; quantity?: number }[] = [
    { key: "all", title: "All" }, // All 沒有 quantity
    ...(post.items?.map((item) => ({
      key: item.id as number,
      title: item.title,
      quantity: item.quantity as number, // 假設 item 物件有 quantity 欄位
    })) || []),
  ];

  return (
    <div className="">
      {/* 遍歷 Tab 列表，為每個 Tab 渲染一個區塊 */}
      {tabs.map((tab) => (
        <div key={tab.key} className="mb-[10px]">
          <CommentCard
            title={tab.title}
            count={getCount(tab.key)}
            quantity={tab.quantity}
            isOpen={activeTab === tab.key}
            onToggle={() => handleTabClick(tab.key)}
            // ✅ All Tab 也允許發起 Weaving (索取所有)
            onWeaving={() => handleWeavingIconClick(tab.key)}
            onPrivateMessage={() => handlePrivateMessage(tab)}
          />
          <AnimatePresence>
            {activeTab === tab.key && (
              <motion.div
                initial={{ opacity: 0.6, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className=" p-4 bg-primary-5 rounded-b-[18px]">
                  <CommentInput
                    postId={post.id}
                    itemId={tab.key === "all" ? "all" : tab.key}
                    user={user}
                    placeholder={
                      tab.key === "all"
                        ? "Write a comment"
                        : `Comment on ${tab.title}`
                    }
                    onSuccess={handleCommentSuccess}
                  />

                  {/* ✅ 條件渲染 WeavingInput */}
                  {weavingInputItem === tab.key && (
                    <WeavingInput
                      user={user}
                      type={tab.key === "all" ? "all" : "item"} // 傳遞 type
                      // All Tab 的 quantityLeft 設為 0 (或忽略)
                      quantityLeft={tab.quantity ?? 0}
                      onWeavingSubmit={(q) => handleWeavingSubmit(tab.key, q)}
                      onCancel={() => setWeavingInputItem(null)}
                    />
                  )}

                  {/* 留言列表 */}
                  <div className="mt-4">
                    {/* ... (留言列表內容不變) ... */}
                    {isLoading ? (
                      <div className="py-4 text-center text-gray-500">
                        <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                        <p className="mt-2 text-sm">Loading...</p>
                      </div>
                    ) : getTabComments(tab.key).length === 0 ? (
                      <div className="py-4 text-center text-gray-500 text-sm">
                        No comments yet. Be the first to comment!
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {getTabComments(tab.key).map((comment) => (
                          <CommentItem
                            key={comment.id}
                            comment={comment}
                            postId={post.id}
                            user={user}
                            onReplySuccess={handleCommentSuccess}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
};

export default CommentSection;
