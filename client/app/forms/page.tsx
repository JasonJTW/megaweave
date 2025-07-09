"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

import {
  Search,
  Plus,
  MapPin,
  Eye,
  Heart,
  Calendar,
  User as UserIcon,
  Tag,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import Image from "next/image";

// 類型定義
interface Post {
  id: number;
  title: string;
  content: string;
  status: string;
  location?: string;
  tags?: string;
  contact?: string;
  category_id: number;
  condition_level: number;
  created_at: string;
  updated_at: string;
  view_count: number;
  interests_count: number;
  username: string;
  category_name: string;
  image_urls?: string;
  thumbnail_urls?: string;
}

interface Category {
  id: number;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Condition {
  id: number;
  level: number;
  name: string;
  description: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

interface PostsResponse {
  posts: Post[];
  pagination: Pagination;
}

import User from "../types/user"; // 假設你有一個 User 類型定義
const PostsApp = () => {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
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
      alert("Please log in to create a post.");
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

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW");
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
    <div className="min-h-screen bg-gray-50">
      {/* 標題區域 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Megaweave</h1>
            <Button
              onClick={handleCreatePostButtonClick}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                user == null
                  ? "bg-gray-400 text-gray-200 cursor-pointer hover:bg-gray-500"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              <Plus className="w-5 h-5" />
              <span>Create new post</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 搜索和篩選區域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
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
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
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
              <div
                key={post.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* 圖片區域 */}
                {post.image_urls && (
                  <div className="h-48 bg-gray-200 overflow-hidden relative">
                    <Image
                      src={post.image_urls.split(",")[0]}
                      alt={post.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}

                <div className="p-4">
                  {/* 標題和分類 */}
                  <div className="mb-2">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
                      {post.title}
                    </h3>
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {post.category_name}
                    </span>
                  </div>

                  {/* 內容 */}
                  <p className="text-gray-600 text-sm line-clamp-3 mb-3">
                    {post.content}
                  </p>

                  {/* 狀況等級 */}
                  <div className="mb-3">
                    <span
                      className={`inline-block text-xs px-2 py-1 rounded-full ${getConditionColor(
                        post.condition_level
                      )}`}
                    >
                      {getConditionName(post.condition_level)}
                    </span>
                  </div>

                  {/* 標籤 */}
                  {post.tags && (
                    <div className="mb-3">
                      <div className="flex items-center text-gray-500 text-xs">
                        <Tag className="w-3 h-3 mr-1" />
                        <span className="line-clamp-1">{post.tags}</span>
                      </div>
                    </div>
                  )}

                  {/* 地點和時間 */}
                  <div className="space-y-1 mb-3">
                    {post.location && (
                      <div className="flex items-center text-gray-500 text-xs">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span>{post.location}</span>
                      </div>
                    )}
                    <div className="flex items-center text-gray-500 text-xs">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>{formatDate(post.created_at)}</span>
                    </div>
                  </div>

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t">
                    <div className="flex items-center">
                      <UserIcon className="w-3 h-3 mr-1" />
                      <span>{post.username}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center">
                        <Eye className="w-3 h-3 mr-1" />
                        <span>{post.view_count}</span>
                      </div>
                      <div className="flex items-center">
                        <Heart className="w-3 h-3 mr-1" />
                        <span>{post.interests_count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                          {cat.name}
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
    </div>
  );
};

export default PostsApp;
