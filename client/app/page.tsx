//* forms/page.tsx
"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  usePullToRefresh,
  DEFAULT_MAXIMUM_PULL_LENGTH,
  DEFAULT_REFRESH_THRESHOLD,
} from "@/hooks/use-pull-to-refresh";
import { Button } from "@/components/ui/button";
import Feed from "./components/PostCard/Feed";
import { usePost } from "./contexts/PostContext";
import { LucideLoader2, X } from "lucide-react";
import toast from "react-hot-toast";
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
import AddIcon from "./components/icons/AddIcon";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const [refreshing, setRefreshing] = useState(false);

  const { categories, conditions } = usePost();
  const { isNavbarVisible } = useNavbar();

  // 分類和狀況數據

  // 搜索和篩選狀態
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locationInput, setLocationInput] = useState(""); // Decoupled input state
  const [searchCity, setSearchCity] = useState("");
  const [searchProvince, setSearchProvince] = useState(""); // Add province state
  const [postFilterType, setPostFilterType] = useState<Post["type"] | "">("");
  const categoryInteractionLockRef = useRef(false);

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
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);

  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const searchLocationInputRef = useRef<HTMLInputElement | null>(null); // Add ref for search input
  const autocompleteInstanceRef =
    useRef<google.maps.places.Autocomplete | null>(null);
  const autocompleteSearchInstanceRef =
    useRef<google.maps.places.Autocomplete | null>(null); // Add ref for search autocomplete

  const extractAddress = (place: google.maps.places.PlaceResult) => {
    const components = place.address_components || [];
    let province = "";
    let city = "";
    let route = ""; // 新增 route
    let zip = "";

    components.forEach((comp) => {
      const types = comp.types;
      // 縣市
      if (types.includes("administrative_area_level_1")) {
        province = comp.long_name;
      }
      // 鄉鎮市區
      if (
        types.includes("sublocality_level_1") ||
        types.includes("administrative_area_level_2")
      ) {
        city = comp.long_name;
      }
      // 街道名稱
      if (types.includes("route")) {
        route = comp.long_name;
      }
      // 郵遞區號
      if (types.includes("postal_code")) {
        zip = comp.long_name;
      }
    });

    return { province, city, route, zip };
  };

  useEffect(() => {
    if (
      !showCreateForm ||
      !locationInputRef.current ||
      autocompleteInstanceRef.current
    ) {
      return;
    }

    // Initialize the traditional Autocomplete
    const autocomplete = new google.maps.places.Autocomplete(
      locationInputRef.current,
      {
        types: ["geocode"], // Street-level precision
        componentRestrictions: { country: "tw" }, // Restrict to Taiwan
        fields: [
          "address_components",
          "formatted_address",
          "geometry",
          "place_id",
        ],
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place && place.geometry && place.geometry.location) {
        const { province, city, route, zip } = extractAddress(place);

        console.log("Place selected:", place);
        setCreateFormData((prev) => ({
          ...prev,
          location: place.formatted_address || place.name || "",
          place_id: place.place_id,
          province,
          city,
          route,
          zip,
          lat: place.geometry!.location!.lat(),
          lng: place.geometry!.location!.lng(),
        }));
      }
    });

    autocompleteInstanceRef.current = autocomplete;

    return () => {
      if (autocompleteInstanceRef.current) {
        google.maps.event.clearInstanceListeners(
          autocompleteInstanceRef.current
        );
        autocompleteInstanceRef.current = null;
      }
    };
  }, [showCreateForm]);

  // Add useEffect for Search Autocomplete
  useEffect(() => {
    if (
      !isMenuOpen ||
      !searchLocationInputRef.current ||
      autocompleteSearchInstanceRef.current
    ) {
      return;
    }

    const autocomplete = new google.maps.places.Autocomplete(
      searchLocationInputRef.current,
      {
        types: ["geocode"], // Restrict to regions (cities/provinces)
        componentRestrictions: { country: "tw" },
        fields: ["address_components",
          "formatted_address",
          "geometry",
          "place_id",],
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place && place.address_components) {
        const { province, city } = extractAddress(place);
        console.log("Search Place:", { province, city });
        
        const address = place.name || place.formatted_address || "";
        setLocationInput(address);
        setSelectedLocation(address);
        setSearchCity(city);
        setSearchProvince(province);
      }
    });

    autocompleteSearchInstanceRef.current = autocomplete;

    return () => {
      if (autocompleteSearchInstanceRef.current) {
        google.maps.event.clearInstanceListeners(
          autocompleteSearchInstanceRef.current
        );
        autocompleteSearchInstanceRef.current = null;
      }
    };
  }, [isMenuOpen]);

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
      toast.error(
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
  const fetchPosts = useCallback(
    async (isPullRefresh = false) => {
      console.log(isPullRefresh ? "Pull refreshing..." : "Loading posts...");
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: "12",
        });
        const delay = isPullRefresh ? 800 : 1;

        if (searchTerm) params.append("search", searchTerm);
        if (selectedCategory) params.append("category_id", selectedCategory);
        // Optimize search params
        if (selectedLocation) params.append("location", selectedLocation);
        if (searchCity) params.append("city", searchCity);
        if (searchProvince) params.append("province", searchProvince);
        if (postFilterType) params.append("type", postFilterType);
        const [response] = await Promise.all([
          fetch(`${hostName}/api/posts?${params}`),
          new Promise((resolve) => setTimeout(resolve, delay)),
        ]);
        const data: PostsResponse = await response.json();

        if (response.ok) {
          setPosts(data.posts);
          setPagination(data.pagination);
        } else {
          toast.error("Fetch posts failed");
        }
      } catch (error) {
        console.error("Internal server error:", error);
        toast.error("Internal server error, please try again later.");
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [
      currentPage,
      searchTerm,
      searchTerm,
      selectedCategory,
      selectedLocation,
      searchCity, // Add to dependency array
      searchProvince, // Add to dependency array
      hostName,
      postFilterType,
    ]
  );

  // mobile 下拉刷新功能，fetchPosts宣告後才啟動
  const { isRefreshing, pullPosition } = usePullToRefresh({
    onRefresh: () => fetchPosts(true),
    maximumPullLength: DEFAULT_MAXIMUM_PULL_LENGTH,
    refreshThreshold: DEFAULT_REFRESH_THRESHOLD,
    // isDisabled:
    //   typeof window !== "undefined"
    //     ? window.innerWidth >= 768 || showCreateForm
  });

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
      toast.error("Required fields cannot be empty.");
      return;
    }

    setIsCreating(true);

    try {
      const formData = new FormData();

      // 添加表單數據
      formData.append("title", createFormData.title);
      formData.append("content", createFormData.content);
      formData.append("location", createFormData.location);
      if (createFormData.place_id) {
        formData.append("place_id", createFormData.place_id);
      }
      if (createFormData.location) {
        formData.append("full_address", createFormData.location);
      }
      if (createFormData.province) {
        formData.append("province", createFormData.province);
      }
      if (createFormData.city) {
        formData.append("city", createFormData.city);
      }
      if (createFormData.route) {
        formData.append("route", createFormData.route);
      }
      if (createFormData.zip) {
        formData.append("zip", createFormData.zip);
      }
      if (createFormData.lat !== undefined && createFormData.lat !== null) {
        formData.append("lat", createFormData.lat.toString());
      }
      if (createFormData.lng !== undefined && createFormData.lng !== null) {
        formData.append("lng", createFormData.lng.toString());
      }
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
        toast.error(errorData.errorMessage || "Failed to create post");
      }
    } catch (error) {
      console.error("Network error:", error);
      toast.error("Network error, please try again later.");
    } finally {
      setIsCreating(false);
    }
  };

  // 處理圖片選擇
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // 限制最多 5 張圖片
    if (selectedImages.length + files.length > 5) {
      toast.error("Limit of 5 images exceeded");
      return;
    }

    // 檢查文件大小和類型
    const validFiles = files.filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB size limit`);
        return false;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} Not a valid image file`);
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

  useEffect(() => {
    if (!isMenuOpen) return; // 只在選單打開時監聽

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 1. 檢查點擊是否發生在主選單 (motion.div) 內部
      const isInsideMenu = menuRef.current && menuRef.current.contains(target);

      const isInsideSearchButton =
        searchButtonRef.current && searchButtonRef.current.contains(target);

      // 2. 檢查點擊是否發生在任何 Radix UI Portal 內容內部 (如 SelectContent)
      // Radix UI 的 Portal 內容通常會有一個 data 屬性，例如 data-radix-popper-content 或 data-state="open"
      // 最常見的方式是檢查 Select 的內容是否是點擊目標的祖先元素。
      const isInsideRadixPortal =
        target.closest("[data-radix-popper-content]") ||
        target.closest(".radix-select-content");

      const isInsideFeed = target.closest(".feed-snap");

      // 邏輯：
      // 如果點擊不在主選單內，AND 點擊也不在任何彈出的 Radix Portal 內
      // 說明這是真正的「外部點擊」，應該關閉主選單。
      if (
        !isInsideMenu &&
        !isInsideRadixPortal &&
        !isInsideSearchButton &&
        !isInsideFeed
      ) {
        // 這裡使用 event.preventDefault() 可以防止點擊事件繼續傳播到更下方的頁面物件
        event.preventDefault();
        setIsMenuOpen(false);
      }
    };

    // 監聽 mousedown 事件
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isMenuOpen]); // isMenuOpen 狀態改變時重新運行

  return (
    <>
      <div className=" fixed inset-0 bg-[#F4F5F3] -z-10"></div>
      <div className="min-h-screen ">
        {/* <AdSense style={{ display: "block", minHeight: "250px" }} /> */}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
          {!showCreateForm && <IconGrid />}
        </div>

        <div
          style={{
            top: (isRefreshing ? DEFAULT_REFRESH_THRESHOLD : pullPosition) / 3,
            opacity: isRefreshing || pullPosition > 0 ? 1 : 0,
          }}
          className="bg-base-100 fixed inset-x-1/2 z-30 h-8 w-8 -translate-x-1/2 rounded-full p-2 shadow"
        >
          <div
            className={`h-full w-full ${isRefreshing ? "animate-spin" : ""}`}
            style={
              !isRefreshing ? { transform: `rotate(${pullPosition}deg)` } : {}
            }
          >
            <LucideLoader2 className="h-full w-full" />
          </div>
        </div>

        <div
          className={` max-w-7xl mx-auto flex flex-col px-8 pb-[20px] pt-[20px] sticky z-20 bg-primary-5 transition-all duration-150 ${
            isNavbarVisible ? "top-[80px]" : "top-[0px]"
          }
         `}
        >
          <div className="flex justify-between items-center w-full">
            <Button
              className="bg-megaweave-red-dark  border-megaweave-red-light border-[2px] text-[#efd0c4] py-[32px] mr-[10px] shadow-none duration-150"
              onClick={() => {
                handleCreatePostButtonClick("wish");
              }}
            >
              + Wish
              <ElfIcon className="text-[#efd0c4] !w-[18px] !h-[18px]" />
            </Button>
            <Button
              className="bg-megaweave-gold border-megaweave-gold-light border-[2px] text-[#fbe7c6] py-[32px] shadow-none duration-150"
              onClick={() => {
                handleCreatePostButtonClick("share");
              }}
            >
              + Share
              <ReuseIcon className="text-[#fbe7c6] !w-[18px] !h-[18px]" />
            </Button>
          </div>

          {/* Active Category Filter Tag - Sticky underneath buttons */}
          <div className="flex flex-wrap gap-2 mt-2 justify-start">
            {selectedCategory && (
              <Badge
                className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm bg-primary-75 text-white transition-colors cursor-pointer"
                onClick={() => setSelectedCategory("")}
              >
                <span>
                  Category:{" "}
                  {categories.find((c) => c.id.toString() === selectedCategory)
                    ?.name_en || "Unknown"}
                </span>
                <X className="w-3 h-3 hover:text-red-300 transition-colors" />
              </Badge>
            )}
            {searchProvince && (
              <Badge
                className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm bg-primary-75 text-white transition-colors cursor-pointer"
                onClick={() => {
                  setSearchProvince("");
                  // Clear location input if it matches ONLY this province to avoid confusion
                  // But usually user wants to clear the specific filter.
                  // For now, allow independent clearing.
                }}
              >
                <span>Province: {searchProvince}</span>
                <X className="w-3 h-3 hover:text-red-300 transition-colors" />
              </Badge>
            )}
            {searchCity && (
              <Badge
                className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm bg-primary-75 text-white transition-colors cursor-pointer"
                onClick={() => {
                  setSearchCity("");
                }}
              >
                <span>City: {searchCity}</span>
                <X className="w-3 h-3 hover:text-red-300 transition-colors" />
              </Badge>
            )}
             {selectedLocation && (
              <Badge
                className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm bg-primary-75 text-white transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedLocation("");
                  setLocationInput(""); // Clear the input too as it's likely a direct text search
                }}
              >
                <span>Location: {selectedLocation}</span>
                <X className="w-3 h-3 hover:text-red-300 transition-colors" />
              </Badge>
            )}
             {/* If we have specific route filter via handleLocationClick, we might want to show it.
                But based on current code, 'selectedLocation' holds the general text or precise location string
                sent to backend as 'location' param if city/province are not enough or as supplement.
                The handleLocationClick below will set 'selectedLocation' for 'route' click.
             */}
          </div>
        </div>

        <>
          {/* 選單面板 */}
          <AnimatePresence>
            {isMenuOpen && (
              <>
                {/* 👇 新增這一塊（非常重要） */}
                {/* {isCategoryOpen && (
                  <div
                    className="fixed inset-0 z-[55]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                )} */}
                {/* 背景遮罩 */}
                <div
                  className="fixed inset-0 z-[45] bg-transparent"
                  // onClick={() => setIsMenuOpen(false)}
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
                  className="fixed bottom-24 right-8 left-8 sm:left-auto z-[60] bg-megaweave-forest-dark/80 backdrop-blur-[3px] rounded-[30px] rounded-br-none p-6 shadow-2xl shadow-black/50 origin-bottom-right flex-col"
                >
                  {/* Search Input */}
                  <div className="relative mb-4">
                    {/* 搜索框 */}
                    <Input
                      type="text"
                      placeholder="Search"
                      className="w-full py-2"
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
                  <div className="flex flex-col gap-[10px] mb-4">
                    <div className="w-full">
                      <Select
                        onOpenChange={(open) => {
                          if (open) {
                            categoryInteractionLockRef.current = true;
                          } else {
                            // ⏱ 延遲一個 tick 再解鎖（關鍵）
                            requestAnimationFrame(() => {
                              categoryInteractionLockRef.current = false;
                            });
                          }
                        }}
                        value={selectedCategory || ""}
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
                            <SelectItem key={cat.id} value={cat.id.toString()}>
                              {cat.name_en}
                            </SelectItem>
                          ))}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategory("");
                            }}
                          >
                            Clear
                          </Button>
                        </SelectContent>
                      </Select>
                    </div>
                      <div className="w-full">
                        <Input
                          ref={searchLocationInputRef}
                          className="text-megaweave-forest-dark w-full "
                          type="text"
                          placeholder="Location"
                          value={locationInput}
                          onChange={(e) => {
                            setLocationInput(e.target.value);
                            // Clear actual search filter if user clears input
                            if (!e.target.value) {
                                setSelectedLocation("");
                                setSearchCity("");
                                setSearchProvince("");
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                setSelectedLocation(locationInput);
                                // Reset specific city/province if manually typed, or keep if logic allows. 
                                // For now, let's assume manual type means general text search or we should clear the specific geo-filters unless we want to keep them.
                                // Simplest: If they hit enter, they mean "search for this text".
                                // Ideally we might want to Geocode it, but here we just pass it as location param.
                                // Warning: If they typed "Taipei" but didn't pick from list, searchCity might be empty.
                                // The backend handles `location` param as a text match if city/province absent.
                            }
                          }}
                        />
                      </div>
                  </div>

                  {/* Filter Buttons Row 2 */}
                  <div className="flex gap-[10px] mb-4">
                    <Button
                      className={`flex-1 ${
                        postFilterType == "wish" ? "bg-primary-50" : "bg-white"
                      } text-megaweave-forest-dark  flex items-center justify-center gap-2 px-1`}
                      onClick={() => {
                        if (postFilterType == "wish") {
                          setPostFilterType("");
                        } else setPostFilterType("wish");
                      }}
                    >
                      Wish Only
                      <ElfIcon className="w-5 h-5 flex-shrink-0" />
                    </Button>
                    <Button
                      className={`flex-1 ${
                        postFilterType == "share" ? "bg-primary-50" : "bg-white"
                      } text-megaweave-forest-dark  flex items-center justify-center gap-2 px-1`}
                      onClick={() => {
                        if (postFilterType == "share") {
                          setPostFilterType("");
                        } else setPostFilterType("share");
                      }}
                    >
                      Share Only
                      <ReuseIcon className="w-5 h-5 flex-shrink-0" />
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
            ref={searchButtonRef}
            onClick={() => {
              setIsMenuOpen((pref) => !pref);
            }}
            className={
              " fixed bottom-6 right-8 z-50 w-[70px] h-[60px] rounded-[30px] p-0 shadow-lg flex items-center justify-center transition-colors duration-300 bg-megaweave-forest-dark/80 backdrop-blur-sm  hover:bg-megaweave-forest-dark/80 active:bg-megaweave-forest-dark/80 "
            }
          >
            <SearchIcon className=" text-white" />
          </Button>
        </>

        {/* Error message and posts*/}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          {/* 錯誤提示 */}

          {/* 下拉刷新時顯示的頂部 Spinner (不會隱藏 Feed) */}
          {refreshing && (
            <div className="flex justify-center py-4 transition-all animate-in fade-in slide-in-from-top-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {/* 邏輯判斷：
            如果是「一般載入(loading)」且「目前沒有貼文」，才顯示中央大 Spinner。
            如果是「下拉刷新」，loading 會是 false (因為我們改用 refreshing 狀態)，
            所以 Feed 會被保留。
        */}
          {/* 貼文網格 */}
          {loading && posts.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <Feed
            posts={posts}
            conditions={conditions}
            onPostClick={(post) => {
              if (categoryInteractionLockRef.current) return;
              router.push(`/item/${post.id}`);
            }}
            weaves={[]} // 這裡先傳空陣列，因為還沒從後端抓 weaves
            currentUserId={user?.userId}
            onWeaveStatusChange={() => {
              fetchPosts(); // 重新抓取資料
            }}
            onCategoryClick={(categoryId) => {
              setSelectedCategory(categoryId.toString());
              // window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onLocationClick={(type, value) => {
              // Handle clickable location parts
              console.log("Location clicked:", type, value);
              if (type === "province") {
                 setSearchProvince(value);
                 setSearchCity(""); 
                 setSelectedLocation(""); 
                 setLocationInput(value); 
              } else if (type === "city") {
                 setSearchCity(value);
                 setSelectedLocation("");
                 setLocationInput(value);
              } else if (type === "route") {
                 setSelectedLocation(value);
                 setLocationInput(value);
              }
            }}
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
                    }}
                    className="text-gray-400 hover:text-gray-600 absolute -right-2 -top-1"
                  >
                    <DeleteIcon />
                  </button>
                </div>

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
                      {selectedImages.length < 5 && (
                        <label
                          htmlFor="image-upload"
                          className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors border-2 border-dashed border-gray-300"
                        >
                          <AddIcon className="w-8 h-8 text-gray-400" />
                        </label>
                      )}
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
                      ref={locationInputRef}
                      type="text"
                      placeholder="Location (City)"
                      defaultValue={createFormData.location}
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
