import type { Weave } from "@/services/weaveService";
import { motion } from "framer-motion";
import { ChevronDown, LucideLoader2, LucideRefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import type { Condition, Post } from "../types/schema";
import WeavingCard from "./WeavingCard";
import toast from "react-hot-toast";

const MAX_VISIBLE_POSTS = 5;
const LIST_ITEM_ESTIMATED_HEIGHT_PX = 120;
const LIST_ITEM_GAP_PX = 12;

interface DrawerListProps {
  title: string;
  posts: Post[];
  conditions: Condition[];
  weaves?: Weave[];
  currentUserId?: number;
  onWeaveStatusChange?: () => void;
  highlightWeaveId?: number;
  fetchWeaves?: () => void | Promise<void>;
}

const DrawerList: React.FC<DrawerListProps> = ({
  title,
  posts,
  weaves,
  currentUserId,
  highlightWeaveId,
  fetchWeaves,
  onWeaveStatusChange,
}) => {
  const router = useRouter();
  const listRef = useRef<(HTMLDivElement | null)[]>([]);
  const shouldAutoExpand =
    weaves?.some((w) => w.id === highlightWeaveId) ?? false;
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (shouldAutoExpand) {
      setIsExpanded(true);
    }
  }, [shouldAutoExpand]);

  useEffect(() => {
    if (!highlightWeaveId || !weaves?.length) return;

    const targetIndex = weaves.findIndex((w) => w.id === highlightWeaveId);
    if (targetIndex === -1) return;

    const timer = setTimeout(() => {
      listRef.current[targetIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [highlightWeaveId, weaves]);

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
  const postsForWeaving: Post[] = weaves ? weaves.map((w) => w.post) : [];
  const postsToRender = isWeavingTab ? postsForWeaving : posts;
  const shouldScrollList = postsToRender.length > MAX_VISIBLE_POSTS;
  const scrollableListMaxHeight =
    MAX_VISIBLE_POSTS * LIST_ITEM_ESTIMATED_HEIGHT_PX +
    (MAX_VISIBLE_POSTS - 1) * LIST_ITEM_GAP_PX;

  const postIdToWeaveMap = new Map<number, Weave>();
  weaves?.forEach((weave) => {
    postIdToWeaveMap.set(weave.post.id, weave);
  });

  const emptyMessage = isWeavingTab
    ? "You have no active weaving yet."
    : `No posts in ${title} yet.`;

  return (
    <div className="mb-4">
      <div
        onClick={handleExpand}
        className="type-h3 mx-4 my-5 flex cursor-pointer select-none items-center justify-between border-b border-primary-30 px-4 py-2 font-ddin text-megaweave-forest-dark"
      >
        <div>{title}</div>
        <ChevronDown
          className={`h-5 w-5 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
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
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }
            : { duration: 0.25, ease: "easeInOut" },
          opacity: { duration: 0.25, ease: "easeInOut" },
          marginBottom: isExpanded
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }
            : { duration: 0.25, ease: "easeInOut" },
        }}
        style={{ overflow: "hidden" }}
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
          {fetchWeaves && (
            <div className="mb-2 text-right">
              <button
                type="button"
                className="px-4"
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label="Refresh list"
              >
                <motion.div
                  animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    isRefreshing
                      ? { duration: 1, ease: "linear", repeat: Infinity }
                      : { duration: 0 }
                  }
                >
                  <LucideRefreshCcw className="h-4 w-4" />
                </motion.div>
              </button>
            </div>
          )}

          <div className="relative mx-4">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[20px] bg-white/40 backdrop-blur-[0.5px] transition-all duration-300 dark:bg-black/40">
                <div className="flex items-center gap-2.5 rounded-full border border-gray-100/50 bg-white/95 px-4 py-2 shadow-md dark:border-zinc-800 dark:bg-zinc-900/95">
                  <LucideLoader2 className="h-4 w-4 animate-spin text-megaweave-forest" />
                  <span className="text-xs font-semibold text-megaweave-forest-dark dark:text-zinc-200">
                    Syncing status...
                  </span>
                </div>
              </div>
            )}

            {postsToRender.length > 0 ? (
              <div
                className={`flex flex-col gap-3 pb-2 transition-all duration-300 ${
                  isRefreshing
                    ? "pointer-events-none select-none opacity-40"
                    : ""
                } ${shouldScrollList ? "overflow-y-auto" : ""}`}
                style={
                  shouldScrollList
                    ? { maxHeight: scrollableListMaxHeight }
                    : undefined
                }
              >
                {postsToRender.map((post, index) => {
                  const directWeave =
                    weaves && weaves[index]?.post.id === post.id
                      ? weaves[index]
                      : undefined;
                  const weave = directWeave ?? postIdToWeaveMap.get(post.id);
                  const uniqueKey = weave
                    ? `weave-${weave.id}`
                    : `post-${post.id}`;

                  return (
                    <div
                      key={uniqueKey}
                      ref={(el) => {
                        listRef.current[index] = el;
                      }}
                    >
                      <WeavingCard
                        post={post}
                        weave={weave}
                        currentUserId={currentUserId}
                        isHighlighted={weave?.id === highlightWeaveId}
                        onClick={() => {
                          toast("conv_id: " + weave?.conversation_id);
                          if (weave?.conversation_id) {
                            router.push(
                              `/messages/${weave.conversation_id}?highlightWeaveId=${weave.id}`,
                            );
                          } else {
                            router.push(`/item/${post.id}`);
                          }
                        }}
                        onWeaveStatusChange={onWeaveStatusChange}
                      />
                    </div>
                  );
                })}
              </div>
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

export default DrawerList;
