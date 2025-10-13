"use client";
import React, { useEffect, useRef, useState } from "react";
import PostCard from "./PostCard"; // 假設與你的 PostCard 同資料夾
import type { Post, Condition } from "../../types/schema";

interface FeedProps {
  posts: Post[];
  conditions: Condition[];
  onPostClick: (post: Post) => void;
}

export default function Feed({ posts, conditions, onPostClick }: FeedProps) {
  // refs for each card DOM
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // ensure cardRefs length matches posts
  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, posts.length);
  }, [posts.length]);

  // scroll handler that finds card whose center is closest to viewport center
  useEffect(() => {
    let rafId: number | null = null;

    const computeClosest = () => {
      const viewportCenter = window.innerHeight / 2;
      let minDist = Number.POSITIVE_INFINITY;
      let minIndex: number | null = null;

      for (let i = 0; i < posts.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const dist = Math.abs(cardCenter - viewportCenter);
        if (dist < minDist) {
          minDist = dist;
          minIndex = i;
        }
      }

      // optional threshold: only set active if it's reasonably near center
      // threshold 可以改小一點（像 120）讓判定更嚴格
      const THRESHOLD = 9999; // 9999 => always choose the nearest; 改小會更嚴格
      if (minIndex !== null && minDist < THRESHOLD) {
        setActiveIndex(minIndex);
      } else {
        setActiveIndex(null);
      }
    };

    const onScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeClosest);
    };

    // 監聽 window scroll 或指定 containerRef 的 scroll
    // 若你的頁面是整頁滾動，監聽 window 即可
    window.addEventListener("scroll", onScroll, { passive: true });
    // 也立即跑一次，確保初始狀態
    computeClosest();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [posts.length]);

  return (
    <div ref={containerRef} className="snap-y snap-mandatory">
      {posts.map((p, i) => (
        <div
          key={p.id}
          // 把 ref 交給外層容器，父元件可讀 rect
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className="snap-center px-4"
        >
          <PostCard
            post={p}
            conditions={conditions}
            onPostClick={onPostClick}
            isExpanded={activeIndex === i}
            // optional: pass index for debugging
            index={i}
          />
        </div>
      ))}
    </div>
  );
}
