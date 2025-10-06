//* forms/page.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
// import dynamic from "next/dynamic";
import PostCard from "./components/PostCard/PostCard";
import {
  Plus,
  Search,
  MapPin,
  Upload,
  X,
  ImageIcon,
  ScanFace,
} from "lucide-react";
import {
  Post,
  PostsResponse,
  Pagination,
  Category,
  Condition,
} from "./types/schema";

import User from "./types/user";
import { useRouter } from "next/navigation";
import Footer from "./components/Footer";
// const AdSense = dynamic(() => import("@/components/AdSense"), { ssr: false });
import IconGrid from "./components/IconGrid";

const PostsApp = () => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  console.log("Host Name: ", hostName);
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 分類和狀況數據
  const [categories, setCategories] = useState<Category[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [conditionsLoading, setConditionsLoading] = useState(false);

  // 搜索和篩選狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  // 創建貼文狀態
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [createFormData, setCreateFormData] = useState({
    title: "",
    content: "",
    location: "",
    tags: "",
    contact: "",
    categoryId: 1,
    conditionLevel: 1,
  });

  const fetchUser = async () => {
    try {
      const response = await fetch(`${hostName}/api/currentUser`, {
        cache: "no-store",
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.json();
        if (response.status === 401) {
          //* User not authenticated
          setUser(null);
          return; // User not authenticated, no need to set error
        } else {
          console.error("Error fetching user data:", errorMessage.errorMessage);
          throw new Error(` ${errorMessage.errorMessage}`);
        }
      }
      const userData = await response.json();
      console.log("Fetched User: ", userData);
      setUser(userData.user);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 獲取分類列表
  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetch(`${hostName}/api/categories`);
      const data = await response.json();

      if (response.ok) {
        console.log("categories: ", data);
        setCategories(data.categories);
      } else {
        console.error("Error fetching categories:", data.errorMessage);
      }
    } catch (error) {
      console.error("Internal error when fetching categories", error);
    } finally {
      setCategoriesLoading(false);
    }
  }, [hostName]);

  // 獲取狀況等級列表
  const fetchConditions = useCallback(async () => {
    setConditionsLoading(true);
    try {
      const response = await fetch(`${hostName}/api/conditions`);
      const data = await response.json();

      if (response.ok) {
        setConditions(data.conditions);
      } else {
        console.error("獲取狀況等級失敗:", data.errorMessage);
      }
    } catch (error) {
      console.error("獲取狀況等級網路錯誤:", error);
    } finally {
      setConditionsLoading(false);
    }
  }, [hostName]);

  // 使用 useCallback 來記憶化 fetchPosts 函數
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "12",
      });

      if (searchTerm) params.append("search", searchTerm);
      if (selectedCategory) params.append("category", selectedCategory);
      if (selectedLocation) params.append("location", selectedLocation);

      const response = await fetch(`${hostName}/api/posts?${params}`);
      const data: PostsResponse = await response.json();

      if (response.ok) {
        setPosts(data.posts);
        setPagination(data.pagination);
      } else {
        setError("Fetch posts failed");
      }
    } catch (error) {
      console.error("Internal server error:", error);
      setError("Internal server error, please try again later.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, selectedCategory, selectedLocation, hostName]);

  const handleCreatePostButtonClick = () => {
    if (!user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/signin?returnTo=${encodeURIComponent(currentUrl)}`);
      return;
    }
    setShowCreateForm(true);
  };
  // 創建貼文
  const handleCreatePost = async () => {
    if (!createFormData.title.trim() || !createFormData.content.trim()) {
      setError("Required fields cannot be empty.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const formData = new FormData();

      // 添加表單數據
      formData.append("title", createFormData.title);
      formData.append("content", createFormData.content);
      formData.append("location", createFormData.location);
      formData.append("tags", createFormData.tags);
      formData.append("contact", createFormData.contact);
      formData.append("categoryId", createFormData.categoryId.toString());
      formData.append(
        "conditionLevel",
        createFormData.conditionLevel.toString()
      );

      //TODO: Add Share Commons option
      // 添加圖片文件
      selectedImages.forEach((image) => {
        formData.append("images", image);
      });

      const response = await fetch(`${hostName}/api/posts`, {
        method: "POST",
        body: formData, // 使用 FormData 而不是 JSON
        credentials: "include",
      });

      if (response.ok) {
        setShowCreateForm(false);
        setSelectedImages([]);

        /// Rest form data to initial state
        setCreateFormData({
          title: "",
          content: "",
          location: "",
          tags: "",
          contact: "",
          categoryId: categories.length > 0 ? categories[0].id : 1,
          conditionLevel: 1,
        });
        fetchPosts(); // 重新獲取貼文列表
      } else {
        const errorData = await response.json();
        setError(errorData.errorMessage || "Failed to create post");
        if (errorData.errorMessage) {
          console.log("error message:", errorData.errorMessage);
        }
      }
    } catch (error) {
      console.error("Network error:", error);
      setError("Network error, please try again later.");
    } finally {
      setIsCreating(false);
    }
  };

  // 處理圖片選擇
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // 限制最多 5 張圖片
    if (selectedImages.length + files.length > 5) {
      setError("Limit of 5 images exceeded");
      return;
    }

    // 檢查文件大小和類型
    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} exceeds 10MB size limit`);
        return false;
      }
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} Not a valid image file`);
        return false;
      }
      return true;
    });

    setSelectedImages((prev) => [...prev, ...validFiles]);
  };

  // 移除選中的圖片
  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 初始化數據
  useEffect(() => {
    fetchCategories();
    fetchConditions();
  }, [fetchCategories, fetchConditions]);

  // 當分類加載完成後設置默認值
  useEffect(() => {
    if (categories.length > 0 && createFormData.categoryId === 1) {
      setCreateFormData((prev) => ({
        ...prev,
        categoryId: categories[0].id,
      }));
    }
  }, [categories, createFormData.categoryId]);

  // 獲取貼文
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Add this useEffect to clean up blob URLs
  useEffect(() => {
    return () => {
      selectedImages.forEach((image) => {
        URL.revokeObjectURL(URL.createObjectURL(image));
      });
    };
  }, [selectedImages]);

  return (
    <>
      <div className=" fixed inset-0 bg-secondary -z-10"></div>
      <div className="min-h-screen ">
        {/* Icon */}
        {/* <AdSense style={{ display: "block", minHeight: "250px" }} /> */}

        <div className="bg-megaweave-secondary shadow-sm border-b">
          <IconGrid />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex justify-between items-center">
              <Button
                onClick={handleCreatePostButtonClick}
                className={`
                // 手機端：固定懸浮在右下角
                fixed bottom-6 right-6 z-40 
                w-14 h-14 rounded-full p-0 shadow-lg
                flex items-center justify-center
                
                // 桌面端：恢復原本位置和樣式
                sm:relative sm:bottom-auto sm:right-auto sm:z-auto
                sm:w-auto sm:h-auto sm:rounded-full sm:shadow-none
                sm:px-3 sm:py-2 sm:flex sm:items-center sm:space-x-1
                
                transition-colors duration-300 ${
                  user == null
                    ? " bg-megaweave-stone/40 backdrop-blur-[2px] border border-megaweave-sand   cursor-pointer sm:bg-megaweave-stone sm:text-white hover:bg-megaweave-red-light"
                    : "bg-primary/30 backdrop-blur-sm border border-primary-30  sm:bg-primary sm:text-white hover:bg-primary-50 "
                }`}
              >
                {user == null ? (
                  <ScanFace
                    style={{ width: "24px", height: "24px" }}
                    className=" text-white"
                  />
                ) : (
                  <Plus className=" text-white" />
                )}
                {/* 手機端隱藏文字，桌面端顯示 */}
                <span className="hidden sm:inline">
                  {user == null ? "Sign in to post" : "Create new post"}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* 搜索和篩選區域 */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-secondary-50 rounded-lg shadow-sm p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* 分類篩選 */}
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:cursor-pointer"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name_en}>
                    {cat.name_en}
                  </option>
                ))}
              </select>

              {/* 地點篩選 */}
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Location..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                />
              </div>

              {/* 重置按鈕 */}
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                  setSelectedLocation("");
                  setCurrentPage(1);
                }}
                className="px-4 py-2 bg-primary-30 hover:bg-primary-15 text-gray-700 rounded-lg transition-colors"
              >
                Resets
              </button>
            </div>
          </div>

          {/* 錯誤提示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* 貼文網格 */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  conditions={conditions}
                  onPostClick={(post) => {
                    router.push(`/item/${post.id}`);
                  }}
                />
              ))}
            </div>
          )}

          {/* 分頁 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center mt-8">
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  previous page
                </button>

                {Array.from(
                  { length: pagination.totalPages },
                  (_, i) => i + 1
                ).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-4 py-2 border rounded-lg ${
                      currentPage === page
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === pagination.totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  next page
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 創建貼文彈窗 */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Create new post
                  </h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={createFormData.title}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          title: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Content *
                    </label>
                    <textarea
                      required
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={createFormData.content}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          content: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Category *
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={createFormData.categoryId}
                        onChange={(e) =>
                          setCreateFormData({
                            ...createFormData,
                            categoryId: parseInt(e.target.value),
                          })
                        }
                        disabled={categoriesLoading}
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name_en}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Condition *
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={createFormData.conditionLevel}
                        onChange={(e) =>
                          setCreateFormData({
                            ...createFormData,
                            conditionLevel: parseInt(e.target.value),
                          })
                        }
                        disabled={conditionsLoading}
                      >
                        {conditions.map((condition) => (
                          <option key={condition.id} value={condition.level}>
                            {condition.name} - {condition.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={createFormData.location}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          location: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      tags
                    </label>
                    <input
                      type="text"
                      placeholder="separate tags with commas"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={createFormData.tags}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          tags: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      聯絡方式
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={createFormData.contact}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          contact: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* 圖片上傳區域 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      item image ({selectedImages.length}/5)
                    </label>

                    {/* 圖片上傳按鈕 */}
                    <div className="mb-4">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                        id="image-upload"
                        disabled={selectedImages.length >= 5}
                      />
                      <label
                        htmlFor="image-upload"
                        className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${
                          selectedImages.length >= 5
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        選擇圖片
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        10MB limit per image, up to 5 images
                      </p>
                    </div>

                    {/* 已選圖片預覽 */}
                    {selectedImages.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {selectedImages.map((image, index) => (
                          <div key={index} className="relative group">
                            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                              <img
                                src={URL.createObjectURL(image)}
                                alt={`預覽 ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                              {Math.round(image.size / 1024)}KB
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 空狀態提示 */}
                    {selectedImages.length === 0 && (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600">
                          點擊上方按鈕選擇商品圖片
                        </p>
                        <p className="text-xs text-gray-500">
                          最多可上傳 5 張圖片
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setSelectedImages([]);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleCreatePost}
                      disabled={isCreating}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {isCreating ? "Posting..." : "Create Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <Footer />
      </div>
    </>
  );
};

export default PostsApp;
