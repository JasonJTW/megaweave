"use client";
import { Weave } from "@/services/weaveService";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";
import { usePost } from "../../contexts/PostContext";
import type { Condition, Post, PostLocationField } from "../../types/schema";
import CommonShareFlowerIcon from "../icons/CommonShareFlowerIcon";
import CommonShareMascotIcon from "../icons/CommonShareMascotIcon";
import CommonShareWIcon from "../icons/CommonShareWIcon";
import ElfFeedIcon from "../icons/ElfFeedIcon";
import PostCard from "./PostCard";

interface FeedProps {
  posts: Post[];
  conditions: Condition[];
  onPostClick: (post: Post) => void;
  weaves?: Weave[];
  highlightWeaveId?: number;
  onCategoryClick?: (categoryId: number) => void;
  onTypeFilterClick?: (type: Post["type"] | "") => void;
  onLocationClick?: (type: PostLocationField, value: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

type MascotFilter = {
  categoryKeywords: string[];
  type?: Post["type"];
};

export default function Feed({
  posts,
  conditions,
  onPostClick,
  weaves,
  highlightWeaveId,
  onCategoryClick,
  onTypeFilterClick,
  onLocationClick,
  onLoadMore,
  hasMore,
}: FeedProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const { categories } = usePost();

  const handleMascotFilterClick = useCallback(
    (filter: MascotFilter) => {
      if (filter.type !== undefined) {
        onTypeFilterClick?.(filter.type);
      }
      const matched = categories.find((cat) =>
        filter.categoryKeywords.some((keyword) =>
          cat.name_en.toLowerCase().includes(keyword.toLowerCase()),
        ),
      );
      if (matched) {
        onCategoryClick?.(matched.id);
      }
    },
    [categories, onCategoryClick, onTypeFilterClick],
  );

  // state + ref pair to avoid stale closures
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const activeIndexRef = useRef<number | null>(activeIndex);

  // Intersection Observer for Infinite Scroll using react-intersection-observer
  const { ref: loadingRef, inView } = useInView({
    rootMargin: "800px 0px", // Trigger fetch when the bottom is still 800px away
  });

  useEffect(() => {
    if (inView && hasMore && onLoadMore) {
      onLoadMore();
    }
  }, [inView, hasMore, onLoadMore]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!highlightWeaveId || !weaves) return;

    // 1. 找到該 weave 在陣列中的 index
    const targetIndex = weaves.findIndex((w) => w.id === highlightWeaveId);

    if (targetIndex !== -1 && cardRefs.current[targetIndex]) {
      // 2. 稍微延遲以確保 DOM 渲染完畢 (特別是剛從 Drawer 展開動畫結束後)
      setTimeout(() => {
        cardRefs.current[targetIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "center", // 將卡片置中
        });

        // (選用) 這裡可以加上一個閃爍動畫的 class 來提示使用者是哪一張
        // cardRefs.current[targetIndex].classList.add("highlight-flash");
      }, 300); // 300ms 大約等 Drawer 展開動畫跑完
    }
  }, [highlightWeaveId, weaves]); // 依賴項

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, posts.length);
  }, [posts.length]);

  const weaveMap = useMemo(() => {
    if (!weaves) return new Map<number, Weave>();
    const map = new Map<number, Weave>();
    weaves.forEach((weave) => {
      map.set(weave.post.id, weave);
    });
    return map;
  }, [weaves]);

  // parameters you can tune
  const HYSTERESIS_PX = 80; // 當新卡片只比舊卡片接近不到這距離（px）就忽略
  const LOCK_DURATION = 200; // 切換後的鎖定期（ms）
  const COMMIT_DEBOUNCE = 80; // commit state 的延遲（ms），可 60-140 間微調
  const lastSwitchTimeRef = useRef<number>(0);

  // commitActiveIndex: 立即更新 ref，但延遲更新 state（避免過度 rerender）
  const commitActiveIndex = useCallback((index: number) => {
    // update ref immediately to avoid stale logic elsewhere
    activeIndexRef.current = index;
    pendingIndexRef.current = index;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      // only setState if different
      setActiveIndex((prev) => (prev === index ? prev : index));
      debounceTimer.current = null;
      pendingIndexRef.current = null;
    }, COMMIT_DEBOUNCE);
  }, []);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      // 多 threshold 讓 IO 更平滑
      threshold: Array.from({ length: 11 }, (_, i) => i / 10),
    };

    const intersectingTargets = new Set<Element>();

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) intersectingTargets.add(entry.target);
        else intersectingTargets.delete(entry.target);
      });

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (intersectingTargets.size === 0) {
          // 不直接 return — 交給 scroll fallback 處理
          return;
        }

        const viewportCenter = window.innerHeight / 2;
        let closestElement: Element | null = null;
        let minDist = Infinity;

        intersectingTargets.forEach((el) => {
          if (!(el instanceof Element)) return;
          const rect = el.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = Math.abs(center - viewportCenter);
          if (dist < minDist) {
            minDist = dist;
            closestElement = el;
          }
        });

        if (!closestElement) return;
        const index = cardRefs.current.findIndex((r) => r === closestElement);
        if (index === -1) return;

        const now = performance.now();
        // 使用 ref（避免 closure stale）
        const curIdx = activeIndexRef.current;
        if (curIdx !== null && cardRefs.current[curIdx]) {
          const currentRect = cardRefs.current[curIdx]!.getBoundingClientRect();
          const currentCenter = currentRect.top + currentRect.height / 2;
          const currentDist = Math.abs(currentCenter - viewportCenter);

          // 若新卡片只比舊卡片近一點點，則忽略
          if (currentDist - minDist < HYSTERESIS_PX) return;

          // 鎖定期間內，不切換
          if (now - lastSwitchTimeRef.current < LOCK_DURATION) return;
        }

        lastSwitchTimeRef.current = now;
        commitActiveIndex(index);
      });
    };

    const observer = new IntersectionObserver(
      observerCallback,
      observerOptions,
    );
    cardRefs.current.forEach((ref) => ref && observer.observe(ref));

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [posts.length, commitActiveIndex]); // 注意不要放 activeIndex，改用 refs

  // --- scroll fallback: 當 IO 沒取得 intersectingTargets（或快速滑動時）用來保險 ---
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // 計算最接近視窗中點的卡片（與上面 IO 用法一致）
        const viewportCenter = window.innerHeight / 2;
        let closest = -1;
        let minDist = Infinity;
        cardRefs.current.forEach((el, idx) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = Math.abs(center - viewportCenter);
          if (dist < minDist) {
            minDist = dist;
            closest = idx;
          }
        });

        if (closest === -1) return;
        const now = performance.now();
        const curIdx = activeIndexRef.current;
        if (curIdx !== null && curIdx !== -1 && cardRefs.current[curIdx]) {
          const currentRect = cardRefs.current[curIdx]!.getBoundingClientRect();
          const currentCenter = currentRect.top + currentRect.height / 2;
          const currentDist = Math.abs(currentCenter - viewportCenter);
          if (currentDist - minDist < HYSTERESIS_PX) return;
          if (now - lastSwitchTimeRef.current < LOCK_DURATION) return;
        }
        lastSwitchTimeRef.current = now;
        commitActiveIndex(closest);
      });
    };

    // 當前容器可能不是 window——如果你的 feed 在可滾動 div 內，改 attach 到該 container 的 ref 而不是 window
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [commitActiveIndex]);

  // memoized click to avoid re-renders
  const handlePostClick = useCallback(
    (p: Post) => onPostClick(p),
    [onPostClick],
  );

  return (
    <div className="feed-snap snap-y snap-mandatory sm:grid sm:snap-none sm:auto-rows-max sm:grid-cols-[repeat(auto-fill,255px)] sm:items-end sm:justify-center sm:gap-x-6 sm:gap-y-[30px]">
      {posts.map((p, i) => {
        // ✅ 取得對應的 weave 資料
        // ✅ 修正邏輯：
        // 1. 如果 weaves 存在且索引 i 的 weave 對應當前 post，直接使用該 weave (解決 Map 覆蓋問題)
        // 2. 否則回退使用 Map 查找 (保留給一般 Feed 使用)
        const directWeave =
          weaves && weaves[i] && weaves[i].post.id === p.id ? weaves[i] : null;
        const weave = directWeave || weaveMap.get(p.id);

        // ✅ 修正 Key：
        // 如果有 weave，使用 weave.id (唯一)；否則使用 post.id
        // 加上前綴以確保完全不衝突
        const uniqueKey = weave ? `weave-${weave.id}` : `post-${p.id}`;

        return (
          <React.Fragment key={uniqueKey}>
            <div
              data-index={i}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="snap-child snap-center pb-4 sm:snap-align-none sm:pb-0"
            >
              <PostCard
                post={p}
                conditions={conditions}
                categories={categories}
                onPostClick={handlePostClick}
                isExpanded={true}
                isFirstVisible={i === 0}
                badgeContainerId={i === 0 ? "tour-badge-anchor" : undefined}
                onCategoryClick={onCategoryClick}
                onLocationClick={onLocationClick}
              />
            </div>

            {/* Desktop-only Sprite Injection */}
            {i === 0 && (
              <button
                type="button"
                onClick={() =>
                  handleMascotFilterClick({
                    categoryKeywords: ["book"],
                    // type: "share",
                  })
                }
                className="relative hidden w-full cursor-pointer flex-col items-center md:flex"
              >
                <div className="relative z-0 mb-3 w-[190px] max-w-[85%] rounded-[32px] rounded-br-[12px] bg-white px-5 py-4 font-ddin text-[16px] font-bold leading-snug text-gray-900">
                  Looking for
                  <br />
                  some books?
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[18px] right-4 h-[20px] w-[18px]"
                    viewBox="0 0 38 43"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M11.5658 42.9998C11.5658 42.9998 18.606 11.5217 0 0H36.4867C43.7491 16.5311 23.1318 43.0813 11.5658 42.9998Z"
                      fill="white"
                    />
                  </svg>
                </div>
                <ElfFeedIcon />
              </button>
            )}
            {i === 4 && (
              <button
                type="button"
                onClick={() =>
                  handleMascotFilterClick({ categoryKeywords: ["appliance"] })
                }
                className="relative hidden w-full cursor-pointer flex-col items-center md:flex"
              >
                <CommonShareMascotIcon className="h-auto w-full" />
                <div className="relative z-0 mt-2 w-[190px] max-w-[85%] rounded-[32px] rounded-tl-[12px] bg-white px-5 py-4 text-center font-ddin text-[16px] font-bold leading-snug text-gray-900">
                  Find some tools
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -top-[18px] left-4 h-[20px] w-[18px]"
                    viewBox="0 0 38 43"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g transform="translate(38,43) scale(-1,-1)">
                      <path
                        d="M11.5658 42.9998C11.5658 42.9998 18.606 11.5217 0 0H36.4867C43.7491 16.5311 23.1318 43.0813 11.5658 42.9998Z"
                        fill="white"
                      />
                    </g>
                  </svg>
                </div>
              </button>
            )}
            {i === 8 && (
              <button
                type="button"
                onClick={() =>
                  handleMascotFilterClick({ categoryKeywords: ["home"] })
                }
                className="relative hidden w-full cursor-pointer flex-col items-center md:flex"
              >
                <div className="relative z-0 mb-3 w-[190px] max-w-[85%] rounded-[32px] rounded-br-[12px] bg-white px-5 py-4 text-center font-ddin text-[16px] font-bold leading-snug text-gray-900">
                  Styling ur home!
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[18px] right-4 h-[20px] w-[18px]"
                    viewBox="0 0 38 43"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M11.5658 42.9998C11.5658 42.9998 18.606 11.5217 0 0H36.4867C43.7491 16.5311 23.1318 43.0813 11.5658 42.9998Z"
                      fill="white"
                    />
                  </svg>
                </div>
                <CommonShareFlowerIcon className="h-auto w-full" />
              </button>
            )}
            {i === 12 && (
              <button
                type="button"
                onClick={() =>
                  handleMascotFilterClick({
                    categoryKeywords: ["material"],
                    type: "share",
                  })
                }
                className="relative hidden w-full cursor-pointer flex-col items-center md:flex"
              >
                <CommonShareWIcon className="h-auto w-full" />
                <div className="relative z-0 mt-2 w-[190px] max-w-[85%] rounded-[32px] rounded-tr-[12px] bg-white px-5 py-4 text-center font-ddin text-[16px] font-bold leading-snug text-gray-900">
                  NEED materials!
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -top-[18px] right-4 h-[20px] w-[18px]"
                    viewBox="0 0 38 43"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g transform="translate(0,43) scale(1,-1)">
                      <path
                        d="M11.5658 42.9998C11.5658 42.9998 18.606 11.5217 0 0H36.4867C43.7491 16.5311 23.1318 43.0813 11.5658 42.9998Z"
                        fill="white"
                      />
                    </g>
                  </svg>
                </div>
              </button>
            )}
          </React.Fragment>
        );
      })}
      {hasMore && (
        <div
          ref={loadingRef}
          className="flex w-full justify-center py-8 sm:col-span-full"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}
