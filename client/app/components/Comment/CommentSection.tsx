// components/Comment/CommentSection.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Post } from "../../types/schema"; // ✅ 移除未使用的 Item
import User from "../../types/user";
import CommentCard from "./CommentCard";
import CommentInput from "./CommentInput";
import CommentItem from "./CommentItem";
import WeavingInput from "./WeavingInput";
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
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ✅ 新增：追蹤哪個 Item Tab 正在顯示 WeavingInput
  const [weavingInputItem, setWeavingInputItem] = useState<number | null>(null);

  // 取得留言數量（初始載入）
  const fetchCounts = useCallback(async () => {
    try {
      const res = await getCommentCounts(post.id);
      setCounts(res.counts);
    } catch (err: unknown) {
      // ✅ 改用 unknown
      console.error("Error fetching counts:", err);
    }
  }, [post.id]);

  // 取得特定 tab 的留言
  const fetchCommentsByTab = useCallback(
    async (tab: TabKey) => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await getComments(post.id, tab);
        setComments(res.comments);
      } catch (err: unknown) {
        // ✅ 改用 unknown
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Error fetching comments");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [post.id]
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

  // ✅ 處理 Weaving Icon 點擊 (開啟索取輸入框)
  const handleWeavingIconClick = (itemId: number) => {
    // 1. 如果 Tab 沒開，先展開 Tab
    if (activeTab !== itemId) {
      setActiveTab(itemId);
    }
    // 2. 顯示 Weaving Input
    setWeavingInputItem(itemId);

    // 📌 建議：這裡可以加入滾動邏輯，將視窗滾動到 WeavingInput 所在的位置。
    // window.scrollTo(0, document.body.scrollHeight);
  };

  // ✅ 處理索取留言的提交邏輯
  const handleWeavingSubmit = (itemId: number, quantity: number) => {
    // 這裡調用你的 API 或服務來發送一條特殊的留言
    // 概念性程式碼：
    // sendWeavingComment(post.id, itemId, user.id, quantity)
    //   .then(() => {
    //     alert(`Successfully requested ${quantity} units for Item ID: ${itemId}`);
    //     handleCommentSuccess();
    //   })
    //   .catch(error => {
    //     alert("Failed to send request: " + error.message);
    //     setWeavingInputItem(null); // 失敗也關閉
    //   });

    // 由於我們沒有實際的 API，這裡先用 alert 模擬成功
    alert(
      `[Placeholder] Successfully requested ${quantity} units for Item ID: ${itemId}`
    );
    handleCommentSuccess(); // 模擬成功後刷新留言並關閉輸入框
  };

  // Tab 列表
  // ✅ 修改：Tabs 列表現在包含 quantity
  // 注意：需要確認 post.items 裡面的欄位名稱是 quantity 還是 stock
  const tabs: { key: TabKey; title: string; quantity?: number }[] = [
    { key: "all", title: "All" }, // All 沒有 quantity
    ...(post.items?.map((item) => ({
      key: item.id as number,
      title: item.title,
      // 假設 item 物件有 quantity 欄位，如果沒有請改為 item.stock 或對應欄位
      quantity: item.quantity as number,
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
            // ✅ 傳遞 handleWeavingIconClick
            // 只有 Item Tab 允許 Weaving
            onWeaving={
              tab.key !== "all"
                ? () => handleWeavingIconClick(tab.key as number)
                : undefined
            }
          />
          <AnimatePresence>
            {activeTab === tab.key && (
              <motion.div
                initial={{ opacity: 0.6, height: 0 }} // 初始狀態
                animate={{ opacity: 1, height: "auto" }} // 展開狀態
                exit={{ opacity: 0, height: 0 }} // 離開/收合狀態
                transition={{ duration: 0.2, ease: "easeInOut" }} // 動畫時間與曲線
                className="overflow-hidden" // 必須有 overflow-hidden 來裁剪 height 0
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
                  {/* ✅ 條件渲染 WeavingInput (只有當 activeTab 且 weavingInputItem 匹配時顯示) */}
                  {tab.key !== "all" && weavingInputItem === tab.key && (
                    <WeavingInput
                      user={user}
                      // 確保傳遞正確的庫存
                      quantityLeft={tab.quantity ?? 0}
                      onWeavingSubmit={(q) =>
                        handleWeavingSubmit(tab.key as number, q)
                      }
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
                    ) : error ? (
                      <div className="py-4 text-center text-red-500 text-sm">
                        {error}
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
