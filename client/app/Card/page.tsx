"use client";
import React from "react";
import CardV2 from "../components/PostCard/CardV2";
import { useState, useCallback, useEffect } from "react";
import { usePost } from "../contexts/PostContext";
import { PostsResponse, Post, Condition, Category } from "../types/schema";
import { useRouter } from "next/navigation";
import Footer from "../components/Footer";
const CardPage = () => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { categories, conditions } = usePost();

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
  }, [hostName]);
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return (
    <>
      <div className="mb-[100vh]">
        {posts.map((post, index) => {
          return (
            <CardV2
              key={index}
              post={post}
              onPostClick={(post) => router.push(`/item/${post.id}`)}
              conditions={conditions}
              categories={categories}
            />
          );
        })}
      </div>
    </>
  );
};

export default CardPage;
