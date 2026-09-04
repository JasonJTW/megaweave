import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import ExpandIcon from "./icons/ExpandIcon";
import Feed from "./PostCard/Feed";
import type { Post, Condition } from "../types/schema";
import { useRouter } from "next/navigation";
import ExpandedIcon from "./icons/ExpandedIcon";
import type { Weave } from "@/services/weaveService";
import { LucideRefreshCcw } from "lucide-react";

interface DrawerProps {
  title: string;
  posts: Post[];
  conditions: Condition[];
  weaves?: Weave[];
  highlightWeaveId?: number;
  fetchWeaves?: () => void | Promise<void>;
}

const Drawer: React.FC<DrawerProps> = ({
  title,
  posts,
  conditions,
  weaves,
  highlightWeaveId,
  fetchWeaves,
}) => {
  const router = useRouter();
  const shouldAutoExpand =
    weaves?.some((w) => w.id === highlightWeaveId) ?? false;
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (shouldAutoExpand) {
      setIsExpanded(true);
    }
  }, [shouldAutoExpand]);

  const handleRefresh = async () => {
    if (!fetchWeaves) return;
    setIsRefreshing(true);
    const minSpinTime = 500;
    const startTime = Date.now();

    try {
      await fetchWeaves();
    } catch (error) {
      console.error("Refresh failed", error);
    } finally {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minSpinTime) {
        await new Promise((resolve) =>
          setTimeout(resolve, minSpinTime - elapsedTime),
        );
      }
      setIsRefreshing(false);
    }
  };
  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  const isWeavingTab = title === "Weaving";
  // ✅ 1. 數據轉換：從 weaves 陣列中提取巢狀的 post 物件
  const postsForWeaving: Post[] = weaves ? weaves.map((w) => w.post) : [];
  // console.log("postsForWeaving: ", postsForWeaving);

  // 選擇要渲染的貼文列表
  const postsToRender = isWeavingTab ? postsForWeaving : posts;

  // 決定空的提示訊息
  const emptyMessage = isWeavingTab
    ? "You have no active weaving yet."
    : `No posts in ${title} yet.`;

  return (
    <div className="mb-4">
      <div className="type-button-b1 mx-4 my-[20px] flex justify-between border-b border-primary-30 px-[16px] py-[8px] font-ddin text-megaweave-forest-dark">
        <div>{title}</div>
        <button
          onClick={handleExpand}
          className="transition-transform duration-300"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 0 : 180 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 15,
            }}
          >
            {isExpanded ? <ExpandedIcon /> : <ExpandIcon />}
          </motion.div>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
          marginBottom: isExpanded ? 0 : -16,
        }}
        transition={{
          height: isExpanded
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] } // 展開：保留彈跳感
            : { duration: 0.25, ease: "easeInOut" }, // 收合：平滑順暢，無回彈
          opacity: {
            duration: 0.25,
            ease: "easeInOut",
          },
          marginBottom: isExpanded
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }
            : { duration: 0.25, ease: "easeInOut" }, // 收合：平滑歸位
        }}
        style={{
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={false}
          animate={{
            y: isExpanded ? 0 : -10,
            scale: isExpanded ? 1 : 0.98,
          }}
          transition={{
            duration: 0.25,
            ease: [0.34, 1.3, 0.64, 1],
          }}
        >
          <div className="">
            <div className="text-right">
              <button
                className="px-4"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <motion.div
                  animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    isRefreshing
                      ? { duration: 1, ease: "linear", repeat: Infinity }
                      : { duration: 0 } // 當停止時直接歸位，避免逆時針旋轉回 0
                  }
                >
                  <LucideRefreshCcw />
                </motion.div>
              </button>
            </div>
            {postsToRender.length > 0 ? (
              <Feed
                posts={postsToRender}
                conditions={conditions}
                onPostClick={(post) => router.push(`/item/${post.public_id}`)}
                weaves={weaves}
                highlightWeaveId={highlightWeaveId}
              />
            ) : (
              <div className="py-8 text-center text-gray-500">
                {emptyMessage}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Drawer;
