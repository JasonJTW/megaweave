//* item/id/page.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  Flag,
  Eye,
  MapPin,
  Tag,
  User as UserIcon,
} from "lucide-react";
import ImageGallery from "../../components/ImageGallery/ImageGalley";
import CommentSection from "../../components/Comment/CommentSection";
import ContactInfo from "../../components/ContactInfo/ContactInfo";
import { Post, Condition, Comment } from "../../types/schema";
import User from "../../types/user";
import ShareButton from "@/app/components/ShareButton/ShareButton";

const PostDetail: React.FC = () => {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  const [post, setPost] = useState<Post | null>(null);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 互動狀態
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showContactInfo, setShowContactInfo] = useState(false);

  // 獲取當前用戶
  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`${hostName}/api/currentUser`, {
        credentials: "include",
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    }
  }, [hostName]);

  // 獲取貼文詳情
  const fetchPost = useCallback(async () => {
    if (!postId) return;

    try {
      const response = await fetch(`${hostName}/api/posts/${postId}`);
      const data = await response.json();

      if (response.ok) {
        setPost(data.post);
        setLikeCount(data.post.interests_count);

        // 檢查用戶是否已按讚
        if (user) {
          const likeResponse = await fetch(
            `${hostName}/api/posts/${postId}/like/status`,
            { credentials: "include" }
          );
          if (likeResponse.ok) {
            const likeData = await likeResponse.json();
            setIsLiked(likeData.isLiked);
          }
        }
      } else {
        setError("無法載入貼文");
      }
    } catch (error) {
      console.error("Error fetching post:", error);
      setError("載入貼文時發生錯誤");
    }
  }, [hostName, postId, user]);

  // 獲取狀況等級
  const fetchConditions = useCallback(async () => {
    try {
      const response = await fetch(`${hostName}/api/conditions`);
      const data = await response.json();
      if (response.ok) {
        setConditions(data.conditions);
      }
    } catch (error) {
      console.error("Error fetching conditions:", error);
    }
  }, [hostName]);

  // 獲取評論
  const fetchComments = useCallback(async () => {
    if (!postId) return;
    try {
      const response = await fetch(`${hostName}/api/posts/${postId}/comments`);
      const data = await response.json();
      if (response.ok) {
        setComments(data.comments);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [hostName, postId]);

  // 處理按讚
  const handleLike = async () => {
    if (!user) {
      alert("請先登入才能按讚");
      return;
    }

    try {
      const response = await fetch(`${hostName}/api/posts/${postId}/like`, {
        method: isLiked ? "DELETE" : "POST",
        credentials: "include",
      });

      if (response.ok) {
        setIsLiked(!isLiked);
        setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  // 提交評論
  const handleSubmitComment = async () => {
    if (!user) {
      alert("請先登入才能留言");
      return;
    }

    if (!newComment.trim()) {
      alert("請輸入評論內容");
      return;
    }

    setIsSubmittingComment(true);
    try {
      const response = await fetch(`${hostName}/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newComment }),
        credentials: "include",
      });

      if (response.ok) {
        setNewComment("");
        fetchComments(); // 重新獲取評論
      } else {
        alert("評論提交失敗");
      }
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("評論提交時發生錯誤");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 分享功能
  const handleShare = async () => {
    // if (navigator.share) {
    //   try {
    //     await navigator.share({
    //       title: post?.title,
    //       text: post?.content,
    //       url: window.location.href,
    //     });
    //   } catch (error) {
    //     console.error("Error sharing:", error);
    //   }
    // } else {
    // 備用方案：複製到剪貼板
    navigator.clipboard.writeText(window.location.href);
    alert("連結已複製到剪貼板");
    // }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 獲取狀況等級顏色
  const getConditionColor = (level: number) => {
    const colors = {
      1: "bg-red-100 text-red-800",
      2: "bg-orange-100 text-orange-800",
      3: "bg-yellow-100 text-yellow-800",
      4: "bg-green-100 text-green-800",
      5: "bg-emerald-100 text-emerald-800",
    };
    return colors[level as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  // 獲取狀況等級名稱
  const getConditionName = (level: number) => {
    const condition = conditions.find((c) => c.level === level);
    return condition ? condition.name : `等級 ${level}`;
  };

  useEffect(() => {
    fetchUser();
    fetchConditions();
  }, [fetchUser, fetchConditions]);

  useEffect(() => {
    if (postId) {
      fetchPost();
      fetchComments();
    }
  }, [postId, fetchPost, fetchComments]);

  useEffect(() => {
    setLoading(false);
  }, [post]);

  // 如果沒有 postId，顯示錯誤
  if (!postId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            無效的貼文ID
          </h2>
          <Button
            onClick={() => router.push("/forms")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            回到主頁
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {error || "找不到貼文"}
          </h2>
          <Button
            onClick={() => router.back()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            返回上一頁
          </Button>
        </div>
      </div>
    );
  }

  const images = post.image_urls ? post.image_urls.split(",") : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 標題列 */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-semibold text-gray-900 truncate">
                {post.title}
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" onClick={handleShare} className="p-2">
                <Share2 className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                className="p-2 text-gray-500 hover:text-red-500"
              >
                <Flag className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：圖片和主要內容 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 圖片輪播 */}
            {images.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <ImageGallery images={images} />
              </div>
            )}

            {/* 貼文內容 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {post.username}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(post.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-gray-500">
                  <Eye className="w-4 h-4" />
                  <span className="text-sm">{post.view_count}</span>
                </div>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                {post.title}
              </h1>

              {/* 分類和狀況 */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-block bg-megaweave-forest-light text-white text-sm px-3 py-1 rounded-full">
                  {post.category_name_en}
                </span>
                <span
                  className={`inline-block text-sm px-3 py-1 rounded-full ${getConditionColor(
                    post.condition_level
                  )}`}
                >
                  {getConditionName(post.condition_level)}
                </span>
              </div>

              {/* 內容 */}
              <div className="prose prose-gray max-w-none mb-6">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {post.content}
                </p>
              </div>

              {/* 標籤 */}
              {post.tags && (
                <div className="flex items-center space-x-2 mb-4">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <div className="flex flex-wrap gap-1">
                    {post.tags.split(",").map((tag, index) => (
                      <span
                        key={index}
                        className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                      >
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 地點 */}
              {post.location && (
                <div className="flex items-center space-x-2 mb-6">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-700">{post.location}</span>
                </div>
              )}

              {/* 互動按鈕 */}
              <div className="flex items-center space-x-4 pt-4 border-t">
                <Button
                  variant="ghost"
                  onClick={handleLike}
                  className={`flex items-center space-x-2 ${
                    isLiked ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`}
                  />
                  <span>{likeCount}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="flex items-center space-x-2 text-gray-500"
                  onClick={() =>
                    document
                      .getElementById("comments")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>{comments.length}</span>
                </Button>
              </div>
            </div>

            {/* 評論區 */}
            <div id="comments" className="bg-white rounded-lg shadow-sm">
              <CommentSection
                comments={comments}
                onSubmitComment={handleSubmitComment}
                newComment={newComment}
                setNewComment={setNewComment}
                isSubmittingComment={isSubmittingComment}
                user={user}
              />
            </div>
          </div>

          {/* 右側：聯絡資訊和相關操作 */}
          <div className="space-y-6">
            {/* 聯絡資訊 */}
            <ContactInfo
              post={post}
              user={user}
              showContactInfo={showContactInfo}
              setShowContactInfo={setShowContactInfo}
            />

            {/* 相關操作 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">相關操作</h3>
              <div className="space-y-3">
                <ShareButton
                  content={window.location.href}
                  label="分享貼文"
                  icon="share"
                  className="w-full justify-start"
                />
                {/* <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Flag className="w-4 h-4 mr-2" />
                  檢舉貼文
                </Button> */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetail;
