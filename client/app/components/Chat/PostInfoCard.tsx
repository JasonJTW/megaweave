"use client";
import React from "react";
import { Post } from "@/app/types/schema";
interface PostInfoCardProps {
  post: Post;
}
const PostInfoCard: React.FC<PostInfoCardProps> = ({ post }) => {
  return (
    <div className="w-full h-[80px] bg-red-300">PostInfoCard {post.id}</div>
  );
};

export default PostInfoCard;
