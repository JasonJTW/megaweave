//* forms/page.tsx
"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import Feed from "./components/PostCard/Feed";
import { usePost } from "./contexts/PostContext";
import { X } from "lucide-react";
import { useNavbar } from "./contexts/NavBarContext";
import {
  Post,
  PostsResponse,
  Pagination,
  CreatePostFormData,
} from "./types/schema";
import { motion, AnimatePresence } from "framer-motion";

import User from "./types/user";
import { useRouter } from "next/navigation";
// const AdSense = dynamic(() => import("@/components/AdSense"), { ssr: false });
import IconGrid from "./components/IconGrid";
import ShareIcon from "./components/icons/ShareIcon";
import AddIcon from "./components/icons/AddIcon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import TagIcon from "./components/icons/TagIcon";
import LocationIcon from "./components/icons/LocationIcon";
import DeleteIcon from "./components/icons/DeleteIcon";
import SearchIcon from "./components/icons/SearchIcon";
import ElfIcon from "./components/icons/ElfIcon";
import ReuseIcon from "./components/icons/ReuseIcon";
const PostsApp = () => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { categories, conditions } = usePost();
  const { isNavbarVisible } = useNavbar();

  // 分類和狀況數據

  // 搜索和篩選狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  // 創建貼文狀態
  const [postType, setPostType] = useState<Post["type"]>("share");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [createFormData, setCreateFormData] = useState<CreatePostFormData>({
    title: "",
    content: "",
    location: "",
    tags: "",
    categoryId: null as number | null,
    conditionLevel: null as number | null,
    type: postType,
    items: [{ title: "", quantity: "" }],
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      if (selectedCategory) params.append("category_id", selectedCategory);
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

  const handleCreatePostButtonClick = (postType: Post["type"]) => {
    if (!user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/signin?returnTo=${encodeURIComponent(currentUrl)}`);
      return;
    }
    setPostType(postType);
    setShowCreateForm(true);
  };

  //! 創建貼文
  const handleCreatePost = async () => {
    const itemsInvalid = createFormData.items?.some(
      (item) => !item.title.trim() || !item.quantity || item.quantity < 1
    );
    if (
      !createFormData.title.trim() ||
      !createFormData.content.trim() ||
      !createFormData.conditionLevel ||
      !createFormData.categoryId
    ) {
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
      formData.append("categoryId", createFormData.categoryId!.toString());
      formData.append(
        "conditionLevel",
        createFormData.conditionLevel.toString()
      );
      formData.append("type", postType);

      //TODO: Add Share Commons option
      // 添加圖片文件
      selectedImages.forEach((image) => {
        formData.append("images", image);
      });

      if (!itemsInvalid) {
        formData.append("items", JSON.stringify(createFormData.items));
        console.log(createFormData.items);
      }

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
          categoryId: null,
          conditionLevel: null,
          type: postType,
          items: [{ title: "", quantity: 1 }],
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
    if (selectedImages.length == 1) {
      setError(null);
    }
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

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

  useEffect(() => {
    if (showCreateForm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    // cleanup：防止狀態殘留
    return () => {
      document.body.style.overflow = "";
    };
  }, [showCreateForm]);

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
      <div className=" fixed inset-0 bg-[#F4F5F3] -z-10"></div>
      <div className="min-h-screen ">
        {/* <AdSense style={{ display: "block", minHeight: "250px" }} /> */}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
          {!showCreateForm && <IconGrid />}
        </div>

        <div
          className={` max-w-7xl mx-auto flex justify-between items-center px-8 py-[20px] sticky z-20 bg-primary-5 transition-all duration-150 ${
            isNavbarVisible ? "top-[80px]" : "top-[0px]"
          }
         `}
        >
          <Button
            className="bg-primary-15  border-primary-30 border-[2px] text-megaweave-forest-dark py-[32px] mr-[10px] shadow-none duration-150"
            onClick={() => {
              handleCreatePostButtonClick("wish");
            }}
          >
            + Wish
            <ElfIcon className="text-megaweave-forest-dark !w-[18px] !h-[18px]" />
          </Button>
          <Button
            className="bg-primary-15 border-primary-30 border-[2px] text-megaweave-forest-dark py-[32px] shadow-none duration-150"
            onClick={() => {
              handleCreatePostButtonClick("share");
            }}
          >
            + Share
            <ReuseIcon className="text-megaweave-forest-dark !w-[18px] !h-[18px]" />
          </Button>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
          <div className="flex justify-between items-center">
            {/* 選單面板 */}
            <AnimatePresence>
              {isMenuOpen && (
                <>
                  {/* 背景遮罩 */}
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <motion.div
                    ref={menuRef}
                    initial={{
                      scale: 0,
                      opacity: 0,
                      x: 0,
                      y: 30,
                      filter: "blur(20px)",
                    }}
                    animate={{
                      scale: 1,
                      opacity: 1,
                      x: 0,
                      y: 0,
                      filter: "blur(0px)",
                    }}
                    exit={{
                      scale: 0,
                      opacity: 0,
                      x: 0,
                      y: 30,
                      filter: "blur(20px)",
                    }}
                    transition={{
                      scale: {
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                        mass: 0.8,
                      },
                      opacity: { duration: 0.2 }, // opacity 提前結束
                      y: {
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                        mass: 0.8,
                      },
                    }}
                    className="fixed bottom-24 right-8 z-50 max-w-6xl bg-megaweave-forest-dark/80 backdrop-blur-sm rounded-[30px] rounded-br-none p-6 shadow-2xl shadow-black/50 origin-bottom-right"
                  >
                    {/* Search Input */}
                    <div className="relative mb-4">
                      {/* 搜索框 */}
                      <Input
                        type="text"
                        placeholder="Search"
                        className="w-full   py-2 "
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />

                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2"
                        onClick={() => setSearchTerm("")}
                      >
                        <DeleteIcon className="w-[18px] h-[18px]" />
                      </button>
                    </div>

                    {/* Filter Buttons Row 1 */}
                    <div className="flex gap-4 mb-4">
                      <div className="w-1/2">
                        <Select
                          value={selectedCategory}
                          onValueChange={(value) => {
                            setSelectedCategory(value);
                            console.log(value);
                          }}
                        >
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem
                                key={cat.id}
                                value={cat.id.toString()}
                              >
                                {cat.name_en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-1/2">
                        <Input
                          className="text-megaweave-forest-dark w-full "
                          type="text"
                          placeholder="Location"
                          value={selectedLocation}
                          onChange={(e) => setSelectedLocation(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Filter Buttons Row 2 */}
                    <div className="flex gap-4 mb-4">
                      <Button className="flex-1 bg-white text-megaweave-forest-dark  flex items-center justify-center gap-2 ">
                        <ElfIcon className="w-5 h-5" /> Wish Only
                      </Button>
                      <Button className="flex-1 bg-white text-megaweave-forest-dark flex items-center justify-center gap-2">
                        <ShareIcon className="w-5 h-5" /> Share Only
                      </Button>
                    </div>

                    {/* Close Overdue Items Button */}
                    <Button className="w-full bg-white text-megaweave-forest-dark font-semibold hover:bg-gray-100">
                      Close Overdue Items
                    </Button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            <Button
              onClick={() => {
                setIsMenuOpen(!isMenuOpen);
              }}
              className={
                " fixed bottom-6 right-8 z-40 w-14 h-12 rounded-[30px] p-0 shadow-lg flex items-center justify-center transition-colors duration-300 bg-megaweave-forest-dark/80 backdrop-blur-sm  hover:bg-megaweave-forest-dark/80 active:bg-megaweave-forest-dark/80 "
              }
            >
              <SearchIcon className=" text-white" />
            </Button>
          </div>
        </div>

        {/* Error message and posts*/}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
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
            <Feed
              posts={posts}
              conditions={conditions}
              onPostClick={(post) => router.push(`/item/${post.id}`)}
            />
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

        {/* Create Post */}
        {showCreateForm && (
          <div className="fixed inset-0 flex z-50 bg-secondary overflow-y-auto font-ddin">
            <div className="bg-secondary rounded-lg max-w-2xl w-full min-h-screen">
              <div className="p-6">
                <div className="flex justify-center relative items-center border-b pb-2">
                  <h2 className="text-2xl font-bold text-gray-900 capitalize">
                    {postType}
                  </h2>
                  <button
                    onClick={() => {
                      setSelectedImages([]);
                      setShowCreateForm(false);
                      setError(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 absolute -right-2 -top-1"
                  >
                    <DeleteIcon />
                  </button>
                </div>
                {/* 錯誤提示 */}
                {/* //TODO: Make this disappear after 3 seconds */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                    {error}
                  </div>
                )}
                {/* 圖片上傳區域 */}
                <div>
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
                    <div className=" bg-primary-30 rounded-lg p-6 min-h-[200px] flex justify-center items-center">
                      <label
                        htmlFor="image-upload"
                        className={`inline-flex items-center px-4 py-2 cursor-pointer hover:scale-125 transition-all duration-200 ease-in-out  ${
                          selectedImages.length >= 5
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        <AddIcon />
                      </label>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    10MB limit per image, up to 5 images
                  </p>
                </div>
                <div className="space-y-[10px] mt-4">
                  {/* Category */}
                  <div>
                    <Select
                      value={createFormData.categoryId?.toString()}
                      onValueChange={(value) =>
                        setCreateFormData({
                          ...createFormData,
                          categoryId: parseInt(value),
                        })
                      }
                    >
                      <SelectTrigger className="">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>

                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Condition */}
                  <div>
                    <Select
                      value={
                        createFormData.conditionLevel !== null
                          ? String(createFormData.conditionLevel)
                          : undefined
                      }
                      onValueChange={(value) => {
                        setCreateFormData({
                          ...createFormData,
                          conditionLevel: parseInt(value),
                        });
                      }}
                    >
                      <SelectTrigger className="w-full ">
                        <SelectValue placeholder="Condition">
                          {/* 自訂顯示邏輯 */}

                          {createFormData.conditionLevel !== null &&
                            conditions.find(
                              (c) => c.level === createFormData.conditionLevel
                            )?.name}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {conditions.map((condition) => (
                          <SelectItem
                            key={condition.id}
                            value={String(condition.level)}
                          >
                            {condition.name} - {condition.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Title */}
                  <div>
                    <Input
                      type="text"
                      required
                      className=""
                      placeholder="Title"
                      value={createFormData.title}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          title: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center gap-[5px]">
                    <TagIcon className="w-[24px] h-[24px] text-primary" />
                    <Input
                      type="text"
                      placeholder="Hashtag separate with commas"
                      className=""
                      value={createFormData.tags}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          tags: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-[5px]">
                    <LocationIcon className="w-[24px] h-[24px] text-primary" />
                    <Input
                      type="text"
                      placeholder="Location (City)"
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
                    <textarea
                      required
                      rows={4}
                      placeholder="description..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-[20px]"
                      value={createFormData.content}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          content: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* items */}
                  {createFormData.items!.map((item, i) => (
                    <div className="flex flex-row gap-2 w-full" key={i}>
                      <Input
                        type="text"
                        required
                        className="!flex-[3] "
                        placeholder={`Item ${String(i + 1).padStart(2, "0")}`}
                        value={item.title}
                        onChange={(e) => {
                          const items = [...createFormData.items!];
                          items[i].title = e.target.value;
                          setCreateFormData({
                            ...createFormData,
                            items,
                          });
                        }}
                      />
                      <Input
                        type="number"
                        required
                        className="!flex-[1] text-[12px] text-center placeholder:text-center"
                        placeholder="Quantity"
                        value={item.quantity ?? ""}
                        onChange={(e) => {
                          const items = [...createFormData.items!];
                          items[i].quantity = e.target.value
                            ? parseInt(e.target.value)
                            : "";
                          setCreateFormData({
                            ...createFormData,
                            items,
                          });
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex space-x-3 ">
                    <Button
                      type="button"
                      onClick={() => {
                        setCreateFormData({
                          ...createFormData,
                          items: [
                            ...(createFormData.items ?? []),
                            { title: "", quantity: "" },
                          ],
                        });
                      }}
                      className="bg-white text-primary shadow-none border border-primary-30 text-[18pt] leading-[18px] py-[8px]"
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      onClick={handleCreatePost}
                      disabled={isCreating}
                      className="disabled:opacity-50"
                    >
                      {isCreating ? "Posting..." : "Create Post"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PostsApp;
