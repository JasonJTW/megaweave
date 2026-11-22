"use client";
import { useRouter } from "@/i18n/navigation";
import React, { useRef } from "react";
import CardV2 from "@/app/components/PostCard/CardV2";
import { useState, useCallback, useEffect } from "react";
import { usePost } from "@/app/contexts/PostContext";
import { PostsResponse, Post } from "@/app/types/schema";
import { useScroll } from "framer-motion";
import { api } from "@/lib/api";
const CardPage = () => {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentPage] = useState(1);
  const { categories, conditions } = usePost();
  const container = useRef(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ["start start", "end end"],
  });

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "12",
      });

      const data = await api<PostsResponse>(`/api/posts?${params}`);
      setPosts(data.posts);
    } catch (error) {
      console.error("Internal server error:", error);
    }
  }, [currentPage]);
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <>
      <div className="relative mb-[100vh]" ref={container}>
        {posts.map((post, index) => {
          const targetScale = 1 - (posts.length - index) * 0.05;
          return (
            <CardV2
              key={index}
              i={index}
              post={post}
              onPostClick={(post) => router.push(`/item/${post.public_id}`)}
              conditions={conditions}
              categories={categories}
              progress={scrollYProgress}
              range={[index / posts.length, 1]}
              targetScale={targetScale}
            />
          );
        })}
      </div>
    </>
  );
};

export default CardPage;
