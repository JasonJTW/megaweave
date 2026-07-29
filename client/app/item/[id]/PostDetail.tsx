//* item/id/page.tsx
"use client";
import { MessageButton } from "@/app/components/Chat/MessageButton";
import ClockIcon from "@/app/components/icons/ClockIcon";
import EditIcon from "@/app/components/icons/EditIcon";
import LocationIcon from "@/app/components/icons/LocationIcon";
import MessageIcon from "@/app/components/icons/MessageIcon";
import ShareBadgeIcon from "@/app/components/icons/ShareBadgeIcon";
import WishBadgeIcon from "@/app/components/icons/WishBadgeIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/utils/imageProcessor";
import { getImageUrl, parseS3Keys } from "@/utils/imageUtils";
import { ArrowLeft, Heart, Share2, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import CommentSection from "../../components/Comment/CommentSection";
import EyesIcon from "../../components/icons/EyesIcon";
import ImageGallery from "../../components/ImageGallery/ImageGalley";
import PostFormModal, {
  PostFormSubmitData,
} from "../../components/PostFormModal";
import PostOwnerSidebar from "../../components/PostOwnerSidebar";
import PostShareModal from "../../components/PostShareModal";
import { useNavbar } from "../../contexts/NavBarContext";
import { useUser } from "../../contexts/UserContext";
import { Post } from "../../types/schema";

interface OwnerProfile {
  username: string;
  avatar_url?: string;
  contact_email?: string | null;
}

type PostDetailProps = {
  postId: string;
};

const PostDetail: React.FC<PostDetailProps> = ({ postId }) => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  const [post, setPost] = useState<Post | null>(null);
  const { user } = useUser();
  const [loading, setLoading] = useState(true);

  // 互動狀態
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // 編輯狀態
  const [showEditForm, setShowEditForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // 桌機右側：貼文擁有者資訊與貼文列表
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [ownerPosts, setOwnerPosts] = useState<Post[]>([]);

  // back and share bar — sync with Navbar visibility
  const { isNavbarVisible } = useNavbar();

  const fetchOwnerSidebar = useCallback(
    async (authorPublicId: string) => {
      try {
        const [profileRes, statsRes] = await Promise.all([
          fetch(`${hostName}/api/userprofile/public/${authorPublicId}`, {
            method: "GET",
            cache: "no-store",
          }),
          fetch(`${hostName}/api/user/stats/public/${authorPublicId}`, {
            method: "GET",
            cache: "no-store",
          }),
        ]);

        if (profileRes.ok) {
          const profileData: OwnerProfile = await profileRes.json();
          setOwnerProfile(profileData);
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setOwnerPosts(statsData.posts || []);
        }
      } catch (error) {
        console.error("Error fetching owner sidebar:", error);
      }
    },
    [hostName],
  );

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
        setLikeCount(data.post.likes_count);

        if (data.post.author_public_id) {
          fetchOwnerSidebar(data.post.author_public_id);
        }

        // 檢查用戶是否已按讚
        if (user) {
          const likeResponse = await fetch(
            `${hostName}/api/posts/${postId}/like`,
            { credentials: "include", method: "GET" },
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
  }, [hostName, postId, user, fetchOwnerSidebar]);

  // 處理更新貼文
  const handleUpdatePost = async (data: PostFormSubmitData) => {
    setIsUpdating(true);
    try {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("location", data.location);
      if (post?.status) {
        formData.append("status", post.status);
      }
      if (data.place_id) formData.append("place_id", data.place_id);
      if (data.location) formData.append("full_address", data.location);
      if (data.province) formData.append("province", data.province);
      if (data.city) formData.append("city", data.city);
      if (data.route) formData.append("route", data.route);
      if (data.zip) formData.append("zip", data.zip);
      if (data.lat !== undefined && data.lat !== null)
        formData.append("lat", data.lat.toString());
      if (data.lng !== undefined && data.lng !== null)
        formData.append("lng", data.lng.toString());
      formData.append("tags", data.tags);
      formData.append("categoryId", data.categoryId.toString());
      formData.append("conditionLevel", data.conditionLevel.toString());
      if (data.expires_at) {
        formData.append("expiresAt", data.expires_at.toISOString());
      } else {
        formData.append("expiresAt", "");
      }

      // items
      if (data.items && data.items.length > 0) {
        const validItems = data.items.filter(
          (item) => item.title.trim() !== "" && item.quantity !== "",
        );
        if (validItems.length > 0) {
          formData.append("items", JSON.stringify(validItems));
        }
      }

      // deleteImageIds
      if (data.deletedImageIds && data.deletedImageIds.length > 0) {
        formData.append("deleteImageIds", JSON.stringify(data.deletedImageIds));
      }

      // new images
      for (const image of data.newImages) {
        const compressedBlob = await compressImage(image, 1200, 1200, 0.85);
        if (compressedBlob) {
          formData.append("images", compressedBlob, "image.webp");
        } else {
          formData.append("images", image);
        }
      }

      const response = await fetch(`${hostName}/api/posts/${postId}`, {
        method: "PUT",
        body: formData,
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Post updated successfully");
        setShowEditForm(false);
        fetchPost(); // Refresh page data without changing URL layout
      } else {
        const errorData = await response.json();
        toast.error(errorData.errorMessage || "Failed to update post");
      }
    } catch (error) {
      console.error("Error updating post:", error);
      toast.error("Failed to update post");
    } finally {
      setIsUpdating(false);
    }
  };

  // 處理按讚
  const handleLike = async () => {
    if (!user) {
      toast.error("Please log in to like");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
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

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this post? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${hostName}/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        toast.success("Post deleted successfully");
        router.push("/");
      } else {
        const errorData = await response.json();
        toast.error(errorData.errorMessage || "Failed to delete post");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  const handleAvatarClick = () => {
    if (post?.author_public_id) {
      router.push(`/profile/${post.author_public_id}`);
    }
  };

  const handleIGShare = async () => {
    //* IG Share to story with link requires native app deep link, not supported in web app
    try {
      const response = await fetch(`/api/og?id=${postId}`);
      if (!response.ok) {
        throw new Error("Failed to generate OG image");
      }
      const blob = await response.blob();
      const shareCard = new File([blob], "post.png", { type: "image/png" });
      const title = `${post?.title} | ${post?.type} by ${post?.username}`;
      await navigator.share({
        title: title,
        url: window.location.href,
        files: [shareCard],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name !== "AbortError") {
        console.error(error);
        toast.error("Failed to share");
      }
    }
  };

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId, fetchPost]);

  // 如果沒有 postId，顯示錯誤
  if (!postId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Invalid Post ID
          </h2>
          <Button
            onClick={() => router.push("/forms")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
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

  const s3Keys = parseS3Keys(post);

  const images = s3Keys.map((key) =>
    key.startsWith("http") ? key : getImageUrl(key, "medium"),
  );

  const fullImages = s3Keys.map((key) =>
    key.startsWith("http") ? key : getImageUrl(key, "original"),
  );

  const initialFormData = {
    title: post.title,
    content: post.content,
    location:
      [post.province, post.city, post.route].filter(Boolean).join("") ||
      post.full_address ||
      "",
    tags: post.tags || "",
    categoryId: post.category_id,
    conditionLevel: post.condition_level,
    expires_at: post.expires_at ? new Date(post.expires_at) : undefined,
    items:
      post.items && post.items.length > 0
        ? post.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
          }))
        : [{ title: "", quantity: "" as const }],
    place_id: post.place_id,
    province: post.province,
    city: post.city,
    route: post.route,
    zip: post.zip_code,
    lat: post.lat,
    lng: post.lng,
  };

  const existingImages =
    post.images?.map((img) => ({
      id: img.id,
      image_url: img.s3_key ? getImageUrl(img.s3_key, "medium") : img.image_url || "",
    })) || [];

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-[#f5f4f3]"></div>
      <div className="min-h-screen bg-[#f5f5f3] font-ddin">
        {/* 標題列 */}
        <div
          className={`fixed left-0 right-0 top-20 z-[21] bg-[#f5f4f3] transition-transform duration-100 lg:hidden ${
            isNavbarVisible ? "translate-y-[0]" : "-translate-y-[250%]"
          }`}
        >
          <div className="mx-auto max-w-4xl px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  onClick={() => router.back()}
                  className="p-4"
                >
                  <ArrowLeft className="h-8 w-8" />
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  onClick={() => setShareModalOpen(true)}
                  className="p-4"
                >
                  <Share2 className="h-8 w-8" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto my-[70px] flex max-w-6xl items-start gap-6 px-4 sm:px-6 lg:px-8">
          {/* 左側：貼文主要內容 */}
          <div className="min-w-0 flex-1 rounded-[30px] bg-white px-5 py-5 sm:px-6 lg:max-w-4xl lg:px-8">
            <div className="space-y-[15px]">
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
                    <div className="relative overflow-hidden rounded-[20px] bg-white shadow-sm">
                      <ImageGallery images={images} fullImages={fullImages} />

                      {/* tags */}
                      <div className="absolute bottom-0 flex w-full flex-row justify-between px-5 py-5">
                        {/* Condition tag */}
                        {post.view_count > 0 && (
                          <div className="flex items-center">
                            <Badge className="bg-[#7c7c7c] px-2 font-ddin text-[14px] font-normal text-white">
                              <EyesIcon className="mr-[4px]" />
                              {post.view_count}
                            </Badge>
                          </div>
                        )}
                        {post.condition_name && (
                          <div className="flex items-center">
                            <Badge>{post.condition_name}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
              <h1 className="mb-4 font-ddin text-2xl text-[36px] font-bold text-gray-900">
                {post.title}
              </h1>
              {/* 分類和狀況 */}
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge>{post.category_name_en}</Badge>
              </div>
              {/* 內容 */}
              <div className="prose prose-gray mb-6 max-w-none">
                <p className="whitespace-pre-wrap break-words text-gray-700">
                  {post.content}
                </p>
              </div>
              <div className="min-h-[18px]">
                {post.tags && (
                  <div className="flex flex-wrap gap-0 leading-[18px]">
                    {post.tags.split(",").map((tag, i) => (
                      <div
                        key={i}
                        className="flex items-center rounded-[10pt] bg-secondary px-[4px] py-[2px]"
                      >
                        {/* <TagIcon className="text-primary" /> */}
                        <span
                          key={i}
                          className="px-2 font-ddin text-[16px] font-medium tracking-wider text-megaweave-forest-dark"
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
                  <div className="flex items-center gap-2">
                    <LocationIcon className="text-primary" />
                    {[post.province, post.city, post.route]
                      .filter(Boolean)
                      .join("") || post.full_address}
                  </div>
                )}
                {post.expires_at && (
                  <div className="flex items-center gap-2">
                    <ClockIcon className="text-primary" />
                    {new Date(post.expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* 貼文內容 */}
              <div
                className="flex items-center rounded-[30px] bg-[#fafafa] p-[9px]"
                onClick={handleAvatarClick}
              >
                <div className="relative h-[50px] w-[50px] items-center justify-center">
                  {post.avatar_url ? (
                    <Image
                      fill
                      src={post!.avatar_url!}
                      alt={`${post!.username}'s avatar`}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xl">
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
              <div className="flex items-center justify-start border-b border-megaweave-blue pb-4">
                <Button
                  variant="ghost"
                  onClick={handleLike}
                  className={`inline-flex w-14 items-center space-x-[1px] ${
                    isLiked ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  <Heart
                    className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`}
                  />
                  <span className="text-black">{likeCount}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="w-14 items-center space-x-[1px] text-gray-500"
                  onClick={() =>
                    document
                      .getElementById("comments")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <MessageIcon className="h-5 w-5 text-dark" />
                </Button>
                {post.user_id && user?.userId !== post.user_id && (
                  <MessageButton
                    recipientPublicId={post.author_public_id}
                    recipientName={post.username || "User"}
                    className="ml-2 h-auto border-0 p-0 text-gray-500 hover:bg-transparent hover:text-primary"
                  />
                )}
                {post.user_id && user?.userId === post.user_id && (
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setShowEditForm(true)}
                      className="flex items-center gap-1 text-gray-500 hover:bg-gray-50 hover:text-primary"
                    >
                      <EditIcon className="h-5 w-5" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleDelete}
                      className="flex items-center gap-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-5 w-5" />
                      <span>Delete</span>
                    </Button>
                  </div>
                )}
              </div>

              {/* 評論區 */}
              <div id="comments" className="rounded-lg bg-white shadow-sm">
                <CommentSection post={post} user={user} />
              </div>
            </div>
          </div>

          {/* 右側：桌機版擁有者側欄 */}
          <PostOwnerSidebar
            username={ownerProfile?.username || post.username}
            avatarUrl={ownerProfile?.avatar_url || post.avatar_url}
            contactEmail={ownerProfile?.contact_email}
            authorPublicId={post.author_public_id}
            posts={ownerPosts}
            currentPostId={post.id}
          />
        </div>
      </div>
      <PostShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        post={post}
        onInstagramShare={handleIGShare}
      />

      <PostFormModal
        isOpen={showEditForm}
        onClose={() => setShowEditForm(false)}
        title="Edit Post"
        submitButtonText="Save Changes"
        isSubmitting={isUpdating}
        initialData={initialFormData}
        existingImages={existingImages}
        onSubmit={handleUpdatePost}
      />
    </>
  );
};
export default PostDetail;
