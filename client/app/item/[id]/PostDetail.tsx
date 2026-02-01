//* item/id/page.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Heart,
  Share2,
  // User as UserIcon,
} from "lucide-react";
import ImageGallery from "../../components/ImageGallery/ImageGalley";
import CommentSection from "../../components/Comment/CommentSection";
import { Post, Condition } from "../../types/schema";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import EyesIcon from "../../components/icons/EyesIcon";
import ShareBadgeIcon from "@/app/components/icons/ShareBadgeIcon";
import WishBadgeIcon from "@/app/components/icons/WishBadgeIcon";
import LocationIcon from "@/app/components/icons/LocationIcon";
import ClockIcon from "@/app/components/icons/ClockIcon";
import MessageIcon from "@/app/components/icons/MessageIcon";
import { MessageButton } from "@/app/components/Chat/MessageButton";
import toast from "react-hot-toast";
import { useUser } from "../../contexts/UserContext";

type PostDetailProps = {
  postId: string;
};

const PostDetail: React.FC<PostDetailProps> = ({ postId }) => {
  const router = useRouter();
  // const params = useParams();
  // const postId = params.id as string;
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  const [post, setPost] = useState<Post | null>(null);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const { user } = useUser();
  const [loading, setLoading] = useState(true);

  // 互動狀態
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // back and share bar
  const [hidden, setHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const condition = conditions.find((c) => c.level === post?.condition_level);
  // 獲取當前用戶
  // No longer need local fetchUser as we use useUser() hook

  // 獲取貼文詳情
  const fetchPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const response = await fetch(`${hostName}/api/posts/${postId}`, {
        credentials: "include",
        method: "GET",
      });
      const data = await response.json();

      if (response.ok) {
        setPost(data.post);
        console.log(data.post);
        setLikeCount(data.post.likes_count);

        // 檢查用戶是否已按讚
        if (user) {
          const likeResponse = await fetch(
            `${hostName}/api/posts/${postId}/like`,
            { credentials: "include", method: "GET" }
          );
          if (likeResponse.ok) {
            const likeData = await likeResponse.json();
            setIsLiked(likeData.liked);
          }
        }
      } else {
        toast.error("Failed to fetch post");
      }
    } catch (error) {
      console.error("Error fetching post:", error);
      toast.error("Failed to fetch post");
    } finally {
      setLoading(false);
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

  // 處理按讚
  const handleLike = async () => {
    if (!user) {
      toast.error("Please log in to like");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`
      );
      return;
    }

    try {
      const response = await fetch(`${hostName}/api/posts/${postId}/like`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errorMessage || "Unknown error");
      }

      if (response.ok) {
        const result = await response.json();
        setIsLiked(result.liked);
        setLikeCount((prev) => (result.liked ? prev + 1 : prev - 1));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  // 分享功能
  // const handleNativeShare = async () => {
  //   try {
  //     await navigator.share({
  //       title: post?.title,
  //       text: `${post?.title}\n${post?.content}`,
  //       url: window.location.href,
  //     });
  //   } catch (error) {
  //     if (error instanceof DOMException && error.name !== "AbortError") {
  //       alert("分享失敗,請稍後再試");
  //     }
  //   }
  // };

  // const handleLineShare = () => {
  //   const shareText = `${post?.title}\n${post?.content}\n${window.location.href}`;
  //   const encodedText = encodeURIComponent(shareText);
  //   window.open(`https://line.me/R/msg/text/?${encodedText}`, "_blank");
  // };

  const handleAvatarClick = () => {
    if (post?.author_public_id) {
      router.push(`/profile/${post.author_public_id}`);
    }
  };

  const handleIGShare = async () => {
    try {
      const response = await fetch(`/api/og?id=${postId}`);
      if (!response.ok) {
        throw new Error("Failed to generate OG image");
      }
      const blob = await response.blob();
      const shareCard = new File([blob], "post.png", { type: "image/png" });
      await navigator.share({
        title: post?.title,
        text: `${post?.title}\n${post?.content}`,
        files: [shareCard],
        url: window.location.href,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to share");
    }
  };

  // 格式化日期
  // const formatDate = (dateString: string) => {
  //   return new Date(dateString).toLocaleDateString("zh-TW", {
  //     year: "numeric",
  //     month: "long",
  //     day: "numeric",
  //     hour: "2-digit",
  //     minute: "2-digit",
  //   });
  // };

  // 獲取狀況等級顏色

  // 獲取狀況等級名稱
  // const getConditionName = (level: number) => {
  //   const condition = conditions.find((c) => c.level === level);
  //   return condition ? condition.name : `等級 ${level}`;
  // };

  useEffect(() => {
    fetchConditions();
  }, [fetchConditions]);

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId, fetchPost]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // 向下滾且離頂端超過100px才隱藏
        setHidden(true);
      } else {
        // 向上滾或回到頂端時顯示
        setHidden(false);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

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

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {"Post not found"}
          </h2>
          <Button
            onClick={() => router.back()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  const images = post.image_urls ? post.image_urls.split(",") : [];

  return (
    <>
      <div className="fixed inset-0 bg-[#f5f4f3] -z-10"></div>
      <div className="min-h-screen bg-[#f5f5f3] font-ddin">
        {/* 標題列 */}
        <div
          className={`fixed left-0 top-20 right-0 z-[21] transition-transform duration-300 bg-[#f5f4f3] ${
            hidden ? "-translate-y-[250%]" : "translate-y-[0]"
          }`}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  onClick={() => router.back()}
                  className="p-4"
                >
                  <ArrowLeft className="w-8 h-8" />
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" onClick={handleIGShare} className="p-4">
                  <Share2 className="w-8 h-8" />
                </Button>
                {/* <Button
                  variant="ghost"
                  onClick={handleNativeShare}
                  className="p-4"
                >
                  <Share2 className="w-8 h-8" />
                </Button> */}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-8 px-5 sm:px-6 lg:px-8 py-5 my-[70px] bg-white rounded-[30px]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左側：圖片和主要內容 */}
            <div className="lg:col-span-2 space-y-[15px]">
              {/* 圖片輪播 */}

              {images.length > 0 && (
                <>
                  <div className="relative">
                    {post.type === "share" && (
                      <ShareBadgeIcon className="absolute -top-1 right-5 z-20" />
                    )}
                    {post.type === "wish" && (
                      <WishBadgeIcon className="absolute -top-1 right-5 z-20" />
                    )}
                    <div className="bg-white rounded-[20px] shadow-sm overflow-hidden relative">
                      <ImageGallery images={images} />

                      {/* tags */}
                      <div className="absolute w-full flex flex-row bottom-0 justify-between px-5 py-5">
                        {/* Condition tag */}
                        {post.view_count > 0 && (
                          <div className=" flex items-center">
                            <Badge className="bg-[#7c7c7c] text-white font-ddin font-normal text-[14px] px-2">
                              <EyesIcon className="mr-[4px] " />
                              {post.view_count}
                            </Badge>
                          </div>
                        )}
                        {condition && (
                          <div className=" flex items-center">
                            <Badge>{condition.name}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
              <h1 className="text-2xl font-bold font-ddin text-[36px] text-gray-900 mb-4">
                {post.title}
              </h1>
              {/* 分類和狀況 */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge>{post.category_name_en}</Badge>
              </div>
              {/* 內容 */}
              <div className="prose prose-gray max-w-none mb-6">
                <p className="text-gray-700 whitespace-pre-wrap break-words">
                  {post.content}
                </p>
              </div>
              <div className="min-h-[18px]">
                {post.tags && (
                  <div className="flex flex-wrap gap-0 leading-[18px]">
                    {post.tags.split(",").map((tag, i) => (
                      <div
                        key={i}
                        className="flex items-center bg-secondary rounded-[10pt] px-[4px] py-[2px]"
                      >
                        {/* <TagIcon className="text-primary" /> */}
                        <span
                          key={i}
                          className="text-[16px]  text-megaweave-forest-dark px-2 font-medium font-ddin tracking-wider"
                        >
                          #{tag.trim()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-[6px] text-[16px] font-medium leading-[18px]">
                {(post.province ||
                  post.city ||
                  post.route ||
                  post.full_address) && (
                  <div className="flex items-center gap-2  ">
                    <LocationIcon className="text-primary" />
                    {[post.province, post.city, post.route]
                      .filter(Boolean)
                      .join("") || post.full_address}
                  </div>
                )}
                {post.created_at && (
                  <div className="flex items-center gap-2  ">
                    <ClockIcon className="text-primary" />
                    {new Date(post.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* 貼文內容 */}
              <div
                className="flex items-center bg-[#fafafa] rounded-[30px] p-[9px]"
                onClick={handleAvatarClick}
              >
                <div className="relative w-[50px] h-[50px] items-center justify-center">
                  {post.avatar_url ? (
                    <Image
                      fill
                      src={post!.avatar_url!}
                      alt={`${post!.username}'s avatar`}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-xl">
                      {post.username ? post.username.charAt(0) : "?"}
                    </div>
                  )}
                </div>
                <div className="ml-[18px]">
                  <h3 className="font-semibold text-gray-900">
                    {`${post.username} (owner)`}
                  </h3>
                </div>
              </div>
              {/* 互動按鈕 */}
              <div className="flex items-center justify-start pb-4 border-b border-megaweave-blue">
                <Button
                  variant="ghost"
                  onClick={handleLike}
                  className={`w-14 inline-flex items-center space-x-[1px] ${
                    isLiked ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${isLiked ? "fill-current" : ""}`}
                  />
                  <span className="text-black">{likeCount}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="items-center w-14 space-x-[1px] text-gray-500"
                  onClick={() =>
                    document
                      .getElementById("comments")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <MessageIcon className="w-5 h-5 text-dark" />
                </Button>
                {post.user_id && user?.userId !== post.user_id && (
                    <MessageButton
                        recipientId={post.user_id}
                        recipientName={post.username || "User"}
                        className="ml-2 border-0 hover:bg-transparent text-gray-500 hover:text-primary p-0 h-auto"
                    />
                )}
              </div>

              {/* 評論區 */}
              <div id="comments" className="bg-white rounded-lg shadow-sm">
                <CommentSection post={post} user={user} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
export default PostDetail;
