"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import PostCard from "./PostCard";
import { usePost } from "../../contexts/PostContext";

import type { Post, Condition } from "../../types/schema";

interface FeedProps {
  posts: Post[];
  conditions: Condition[];
  onPostClick: (post: Post) => void;
}

export default function Feed({ posts, conditions, onPostClick }: FeedProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const { categories } = usePost();

  // state + ref pair to avoid stale closures
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const activeIndexRef = useRef<number | null>(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, posts.length);
  }, [posts.length]);

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
      observerOptions
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
    [onPostClick]
  );

  return (
    <div className="feed-snap snap-y snap-mandatory">
      {posts.map((p, i) => (
        <div
          key={p.id}
          data-index={i}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className="snap-child snap-center px-4"
        >
          <PostCard
            post={p}
            conditions={conditions}
            categories={categories}
            onPostClick={handlePostClick}
            isExpanded={activeIndex === i}
          />
        </div>
      ))}
      <div className="h-[40vh]" aria-hidden="true" />
    </div>
  );
}
