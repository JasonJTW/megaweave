"use client";
import React, { useRef } from "react";
import CardV2 from "../components/PostCard/CardV2";
import { useState, useCallback, useEffect } from "react";
import { usePost } from "../contexts/PostContext";
import { PostsResponse, Post } from "../types/schema";
import { useRouter } from "next/navigation";
import { useScroll } from "framer-motion";
const CardPage = () => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
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

      const response = await fetch(`${hostName}/api/posts?${params}`);
      const data: PostsResponse = await response.json();

      if (response.ok) {
        setPosts(data.posts);
      }
    } catch (error) {
      console.error("Internal server error:", error);
    }
  }, [hostName, currentPage]);
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <>
      <div className="mb-[100vh] relative" ref={container}>
        {posts.map((post, index) => {
          const targetScale = 1 - (posts.length - index) * 0.05;
          return (
            <CardV2
              key={index}
              i={index}
              post={post}
              onPostClick={(post) => router.push(`/item/${post.id}`)}
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
