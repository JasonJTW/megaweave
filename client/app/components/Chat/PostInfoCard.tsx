"use client"
import React from 'react'
import { Post } from '@/app/types/schema'

const PostInfoCard: React.FC<Post> = (post:Post) => {
  return (
    <div>PostInfoCard {post.id}</div>
  )
}

export default PostInfoCard