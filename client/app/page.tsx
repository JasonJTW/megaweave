//* forms/page.tsx
"use client";
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import useSWRInfinite from "swr/infinite";
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
import PrivateMessageIcon from "./components/icons/PrivateMessageIcon";
import { Post, PostsResponse, PostLocationField } from "./types/schema";
import { motion, AnimatePresence } from "framer-motion";
import { compressImagesParallel } from "@/utils/imageProcessor";
import OverlayTour, { TourStep } from "./components/OverlayTour";

import { useRouter } from "next/navigation";
import { useUser } from "./contexts/UserContext";
// const AdSense = dynamic(() => import("@/components/AdSense"), { ssr: false });
import IconGrid from "./components/IconGrid";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import PostFormModal, { PostFormSubmitData } from "./components/PostFormModal";

import {
  RefractiveDiv,
  RefractiveButton,
} from "./components/Refractive.client";

import DeleteIcon from "./components/icons/DeleteIcon";
import SearchIcon from "./components/icons/SearchIcon";
import ElfIcon from "./components/icons/ElfIcon";
import ReuseIcon from "./components/icons/ReuseIcon";
import WazowskiIcon from "./components/icons/WazowskiIcon";
import LetsStartWeavingBanner from "./components/ui/LetsStartWeavingBanner";
import CommonShareIcon from "./components/icons/CommonShareIcon";
const PostsApp = () => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const { user } = useUser();
  const [isStuck, setIsStuck] = useState(false);
  // Ref on the desktop header — we watch its bottom edge to decide when to stick
  const desktopHeaderRef = useRef<HTMLDivElement>(null);
  // Ref on the search/filter bar
  const barRef = useRef<HTMLDivElement>(null);
  // Track stuck state in a ref so the scroll handler can read it without stale-closure issues
  const isStuckRef = useRef(false);

  const { categories, conditions } = usePost();
  const { isNavbarVisible } = useNavbar();
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isWeavingExpanded, setIsWeavingExpanded] = useState(false);
  const weavingButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkSticky = () => {
      if (!desktopHeaderRef.current) return;
      const bottom = desktopHeaderRef.current.getBoundingClientRect().bottom;
      // Hysteresis: require 20px past threshold to engage, 20px before to disengage.
      // This prevents rapid toggling when the user scrolls slowly near the boundary.
      if (!isStuckRef.current && bottom < -20) {
        isStuckRef.current = true;
        setIsStuck(true);
      } else if (isStuckRef.current && bottom > 20) {
        isStuckRef.current = false;
        setIsStuck(false);
      }
    };
    window.addEventListener("scroll", checkSticky, { passive: true });
    checkSticky();
    return () => window.removeEventListener("scroll", checkSticky);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSeenTour = localStorage.getItem("megaweave_tour_seen");
      if (!hasSeenTour) {
        setTimeout(() => setIsTourOpen(true), 300);
      }
    }
  }, []);

  const TOUR_STEPS: TourStep[] = [
    {
      targetId: undefined,
      content:
        'megaweaving is a platform for resources sharing and circulation.\n\nThe concept of "weaving" allows users to exchange resources for free, creating a cycle that maximizes resource efficiency through collective sharing.\n\nBy "weave" user with those who "share" or "wish", we foster sustainability and strengthen community bonds.',
      layoutType: "welcome",
    },
    {
      targetId: "tour-wish",
      content: "Post a request for specific resources\nyou are looking for.",
      layoutType: "wish",
    },
    {
      targetId: "tour-share",
      content: "List resources you want to\ngive away to the community.",
      layoutType: "share",
    },
    {
      targetId: "tour-feed",
      content: "Scroll vertical to browse.",
      layoutType: "scroll",
    },
    {
      targetId: undefined,
      content: (
        <span>
          Free resources only.
          <br />
          <strong className="text-megaweave-red-dark">
            No monetary transactions
          </strong>
          <br />
          or trades involved.
        </span>
      ),
      layoutType: "rules",
    },
    {
      targetId: "tour-message",
      content: (
        <span>
          Click
          <div className="mx-2 inline-block rounded-full bg-white px-2 py-1 align-top">
            <PrivateMessageIcon />
          </div>
          button to send a private message and request weaving with the owner of
          the post.
        </span>
      ),
      layoutType: "message",
    },
  ];

  // 分類和狀況數據

  // 搜索和篩選狀態
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locationInput, setLocationInput] = useState(""); // Decoupled input state
  const [searchCity, setSearchCity] = useState("");
  const [searchProvince, setSearchProvince] = useState(""); // Add province state
  const [postFilterType, setPostFilterType] = useState<Post["type"] | "">("");
  const [hideOverdue, setHideOverdue] = useState(false);
  const categoryInteractionLockRef = useRef(false);

  const getKey = useCallback(
    (pageIndex: number, previousPageData: PostsResponse | null) => {
      // reached the end
      if (previousPageData && !previousPageData.posts.length) return null;

      const params = new URLSearchParams({
        page: (pageIndex + 1).toString(),
        limit: "12",
      });

      if (searchTerm) params.append("search", searchTerm);
      if (selectedCategory) params.append("category_id", selectedCategory);
      if (selectedLocation) params.append("location", selectedLocation);
      if (searchCity) params.append("city", searchCity);
      if (searchProvince) params.append("province", searchProvince);
      if (postFilterType) params.append("type", postFilterType);

      // 首頁所有的瀏覽與條件篩選（分類、Wish/Share、地點、關鍵字）統一走個人化推薦混合重排 API
      return `${hostName}/api/posts/feed?${params.toString()}`;
    },
    [
      hostName,
      searchTerm,
      selectedCategory,
      selectedLocation,
      searchCity,
      searchProvince,
      postFilterType,
    ],
  );

  const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((res) => res.json());

  const { data, size, setSize, isValidating, mutate } =
    useSWRInfinite<PostsResponse>(getKey, fetcher, {
      revalidateFirstPage: false,
    });

  const posts = useMemo(() => {
    if (!data) return [];
    const allPosts: Post[] = [];
    const seenIds = new Set<number>();

    for (const page of data) {
      if (!page?.posts) continue;
      for (const p of page.posts) {
        if (!seenIds.has(p.id)) {
          if (hideOverdue) {
            const isExpired = p.expires_at
              ? new Date(p.expires_at) < new Date()
              : false;
            if (isExpired) continue;
          }
          seenIds.add(p.id);
          allPosts.push(p);
        }
      }
    }
    return allPosts;
  }, [data, hideOverdue]);

  const loading = isValidating && (!data || data.length === 0);
  const refreshing = isValidating && data?.length === size;

  const pagination = data ? data[data.length - 1]?.pagination : null;
  const hasMore = pagination
    ? pagination.currentPage < pagination.totalPages
    : false;

  // 創建貼文狀態
  const [postType, setPostType] = useState<Post["type"]>("share");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // (Form states and validations extracted to PostFormModal)

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);

  const searchLocationInputRef = useRef<HTMLInputElement | null>(null); // Add ref for search input
  const desktopSearchLocationInputRef = useRef<HTMLInputElement | null>(null); // Add ref for desktop search input

  const autocompleteSearchInstanceRef =
    useRef<google.maps.places.Autocomplete | null>(null); // Add ref for search autocomplete
  const desktopAutocompleteSearchInstanceRef =
    useRef<google.maps.places.Autocomplete | null>(null); // Desktop search autocomplete

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

  // Add useEffect for Search Autocomplete (Desktop)
  useEffect(() => {
    if (
      !desktopSearchLocationInputRef.current ||
      desktopAutocompleteSearchInstanceRef.current
    ) {
      return;
    }

    let checkGoogleInterval: NodeJS.Timeout;

    const initAutocomplete = () => {
      if (
        typeof window === "undefined" ||
        !window.google ||
        !window.google.maps ||
        !window.google.maps.places ||
        !desktopSearchLocationInputRef.current
      ) {
        return;
      }

      try {
        const autocomplete = new google.maps.places.Autocomplete(
          desktopSearchLocationInputRef.current,
          {
            types: ["geocode"],
            componentRestrictions: { country: "tw" },
            fields: [
              "address_components",
              "formatted_address",
              "geometry",
              "place_id",
            ],
          },
        );

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (place && place.address_components) {
            const { province, city } = extractAddress(place);
            const address = place.name || place.formatted_address || "";
            setLocationInput(address);
            setSelectedLocation(address);
            setSearchCity(city);
            setSearchProvince(province);
          }
        });

        desktopAutocompleteSearchInstanceRef.current = autocomplete;
        if (checkGoogleInterval) {
          clearInterval(checkGoogleInterval);
        }
      } catch (error) {
        console.warn(
          "Failed to initialize desktop search autocomplete:",
          error,
        );
      }
    };

    if (typeof window !== "undefined" && window.google) {
      initAutocomplete();
    } else if (typeof window !== "undefined") {
      checkGoogleInterval = setInterval(() => {
        if (window.google) {
          initAutocomplete();
        }
      }, 300);
    }

    return () => {
      if (checkGoogleInterval) {
        clearInterval(checkGoogleInterval);
      }
      if (
        desktopAutocompleteSearchInstanceRef.current &&
        typeof window !== "undefined" &&
        window.google
      ) {
        google.maps.event.clearInstanceListeners(
          desktopAutocompleteSearchInstanceRef.current,
        );
        desktopAutocompleteSearchInstanceRef.current = null;
      }
    };
  }, []);

  // Add useEffect for Search Autocomplete

  useEffect(() => {
    if (
      !isMenuOpen ||
      !searchLocationInputRef.current ||
      autocompleteSearchInstanceRef.current ||
      !window.google?.maps?.places
    ) {
      return;
    }

    try {
      const autocomplete = new google.maps.places.Autocomplete(
        searchLocationInputRef.current,
        {
          types: ["geocode"], // Restrict to regions (cities/provinces)
          componentRestrictions: { country: "tw" },
          fields: [
            "address_components",
            "formatted_address",
            "geometry",
            "place_id",
          ],
        },
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
    } catch (error) {
      console.warn("Failed to initialize mobile search autocomplete:", error);
    }

    return () => {
      if (autocompleteSearchInstanceRef.current) {
        google.maps.event.clearInstanceListeners(
          autocompleteSearchInstanceRef.current,
        );
        autocompleteSearchInstanceRef.current = null;
      }
    };
  }, [isMenuOpen]);

  // No longer need local fetchUser as we use useUser() hook

  // mobile 下拉刷新功能
  const { isRefreshing, pullPosition } = usePullToRefresh({
    onRefresh: async () => {
      await mutate();
    },
    maximumPullLength: DEFAULT_MAXIMUM_PULL_LENGTH,
    refreshThreshold: DEFAULT_REFRESH_THRESHOLD,
    // isDisabled:
    //   typeof window !== "undefined"
    //     ? window.innerWidth >= 768 || showCreateForm
  });

  const handleCreatePostButtonClick = useCallback(
    (postType: Post["type"]) => {
      if (!user) {
        const currentUrl = window.location.pathname + window.location.search;
        router.push(`/signin?returnTo=${encodeURIComponent(currentUrl)}`);
        return;
      }
      setPostType(postType);
      setShowCreateForm(true);
    },
    [user, router],
  );

  // Stable callbacks passed to <Feed> — wrapped in useCallback so Feed's props
  // reference stays the same across re-renders, preventing unnecessary re-renders.
  const handleFeedPostClick = useCallback(
    (post: Post) => {
      if (categoryInteractionLockRef.current) return;
      router.push(`/item/${post.id}`);
    },
    [router],
  );

  const handleFeedCategoryClick = useCallback((categoryId: number) => {
    setSelectedCategory(categoryId.toString());
    window.scrollTo({ top: 300, behavior: "smooth" });
  }, []);

  const handleFeedTypeFilterClick = useCallback((type: Post["type"] | "") => {
    setPostFilterType(type);
    window.scrollTo({ top: 300, behavior: "smooth" });
  }, []);

  const handleFeedLocationClick = useCallback(
    (type: PostLocationField, value: string) => {
      setLocationInput(value);
      console.log(type);

      switch (type) {
        case "province":
          setSearchProvince(value);
          setSearchCity("");
          setSelectedLocation("");
          break;
        case "city":
          setSearchCity(value);
          setSelectedLocation("");
          break;
        case "route":
        case "location_name":
          setSelectedLocation(value);
          break;
      }

      window.scrollTo({ top: 300, behavior: "smooth" });
    },
    [],
  );

  //! 創建貼文
  const handleCreatePost = async (data: PostFormSubmitData) => {
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("location", data.location);
      if (data.place_id) formData.append("place_id", data.place_id);
      if (data.location_name)
        formData.append("location_name", data.location_name);
      if (data.location_url) formData.append("location_url", data.location_url);
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
        formData.append("expires_at", data.expires_at.toISOString());
      }
      formData.append("type", postType);

      // 壓縮並添加圖片 (平行處理 + 量化基準測試日誌)
      if (data.newImages && data.newImages.length > 0) {
        const processedImages = await compressImagesParallel(
          data.newImages,
          1200,
          1200,
          0.85,
        );
        for (const { blob, filename } of processedImages) {
          formData.append("images", blob, filename);
        }
      }

      if (data.items && data.items.length > 0) {
        formData.append("items", JSON.stringify(data.items));
      }

      const response = await fetch(`${hostName}/api/posts`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (response.ok) {
        setShowCreateForm(false);
        toast.success("Post created successfully!");
        mutate(); // 重新獲取貼文列表
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

  // (SWR automatically handles refetching when getKey dependencies change)
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

  return (
    <>
      <OverlayTour
        steps={TOUR_STEPS}
        isOpen={isTourOpen}
        onClose={() => {
          setIsTourOpen(false);
          localStorage.setItem("megaweave_tour_seen", "true");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <div className="fixed inset-0 -z-10 bg-[#F4F5F3]"></div>
      <div className="min-h-screen">
        {/* <AdSense style={{ display: "block", minHeight: "250px" }} /> */}
        {/* === Desktop Head Area === */}
        <div
          ref={desktopHeaderRef}
          className="relative z-20 mx-auto hidden w-full max-w-7xl flex-col px-8 pb-4 pt-8 font-ddin md:flex"
        >
          <div className="flex max-h-[640px] items-stretch justify-between gap-12">
            {/* Left Column: IconGrid */}
            <div className="flex w-[50%] max-w-[640px] flex-1 items-center">
              <div className="aspect-square w-full">
                {!showCreateForm && <IconGrid />}
              </div>
            </div>

            {/* Right Column: Stacked Action Buttons */}
            <div className="flex max-h-[640px] w-[35%] flex-col gap-8 py-8">
              <Button
                className="relative flex max-h-[160px] w-full flex-1 items-center justify-start overflow-hidden rounded-full border-[2px] border-primary-30 bg-primary-15 py-0 pl-8 pr-0 shadow-none hover:border-white"
                onClick={() => handleCreatePostButtonClick("wish")}
              >
                <span className="relative z-10 ml-2 text-3xl font-bold tracking-wide text-megaweave-forest-dark">
                  + Wish
                </span>
                <div className="pointer-events-none absolute right-[-10px] top-1/2 flex aspect-square h-full -translate-y-1/2 items-center justify-center">
                  <ElfIcon className="!h-full !w-full text-[#CB5E32]" />
                </div>
              </Button>

              <Button
                className="relative flex max-h-[160px] w-full flex-1 items-center justify-start overflow-hidden rounded-full border-[2px] border-primary-30 bg-primary-15 py-0 pl-8 pr-0 shadow-none hover:border-white"
                onClick={() => handleCreatePostButtonClick("share")}
              >
                <span className="relative z-10 ml-2 text-3xl font-bold tracking-wide text-megaweave-forest-dark">
                  + Share
                </span>
                <div className="pointer-events-none absolute right-[-10px] top-1/2 flex aspect-square h-full -translate-y-1/2 items-center justify-center">
                  <WazowskiIcon className="!h-full !w-full" />
                </div>
              </Button>

              <Button
                disabled
                className="relative flex max-h-[160px] w-full flex-1 cursor-not-allowed items-center justify-start overflow-hidden rounded-full border-[2px] border-transparent bg-[#3B6232] py-0 pl-8 pr-0 text-white opacity-80 shadow-none"
              >
                <div className="relative z-10 ml-2 flex flex-col text-left">
                  <span className="text-[20px] font-bold leading-tight text-white opacity-90">
                    + Common
                  </span>
                  <span className="text-[20px] font-bold leading-tight text-white opacity-90">
                    Share
                  </span>
                  <span className="mt-1 text-xs font-bold tracking-wider text-white opacity-80">
                    Coming soon
                  </span>
                </div>
                <div className="pointer-events-none absolute right-[-20px] top-1/2 flex aspect-square h-full -translate-y-1/2 items-center justify-center">
                  <CommonShareIcon className="!h-full !w-full text-[#2c4b25] opacity-50" />
                </div>
              </Button>
            </div>
          </div>
        </div>
        {/* Desktop search & filter bar — scrolls away with the page (no sticky/fixed) */}
        <div ref={barRef} className="z-20 hidden bg-[#f4f5f3] md:block">
          {/* Inner wrapper mirrors the original max-w / padding */}
          <div className="mx-auto max-w-7xl px-8 pb-2 pt-4">
            <div
              className={`flex w-full ${
                isStuck ? "flex-row items-center gap-1 lg:gap-2" : "flex-col"
              }`}
            >
              {/* Search Bar */}
              <div
                className={`flex flex-row items-center rounded-full border-[2px] border-transparent bg-white shadow-none transition-all duration-300 ${
                  isStuck
                    ? "h-12 min-w-[100px] flex-1 px-4 py-1"
                    : "mb-4 w-full px-6 py-4"
                }`}
              >
                <input
                  type="text"
                  placeholder="Search"
                  className={`h-auto w-full border-0 bg-transparent p-0 outline-none transition-all duration-300 placeholder:text-primary-50 focus:outline-none focus:ring-0 ${
                    isStuck ? "type-body-t2" : "type-h3"
                  }`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm ? (
                  <button onClick={() => setSearchTerm("")}>
                    <X className="ml-2 h-5 w-5 shrink-0 text-[#333]" />
                  </button>
                ) : (
                  <div className="ml-2 h-5 w-5 shrink-0 border-none bg-transparent" />
                )}
              </div>
              <div
                className={`type-button-b1 flex items-center gap-1 transition-all duration-300 lg:gap-2 ${
                  isStuck
                    ? "flex-none"
                    : "w-full flex-wrap justify-between xl:flex-nowrap"
                }`}
              >
                <div
                  className={`flex items-center justify-between rounded-full bg-white text-[#333] transition-all duration-300 ${
                    isStuck
                      ? "w-[130px] flex-none lg:w-[150px]"
                      : "min-w-[130px] flex-1"
                  }`}
                >
                  <Select
                    value={selectedCategory || "ALL"}
                    onValueChange={(value) =>
                      setSelectedCategory(value === "ALL" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      className={`flex w-full items-center justify-between truncate border-0 bg-transparent shadow-none transition-all duration-300 focus:ring-0 ${
                        isStuck ? "h-10 px-3 py-2 lg:px-4" : "px-4 py-6 lg:px-6"
                      }`}
                    >
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div
                  className={`flex items-center justify-between rounded-full bg-white font-semibold text-[#333] transition-all duration-300 ${
                    isStuck
                      ? "h-10 w-[140px] flex-none pl-2 pr-1 lg:w-[160px] lg:px-4"
                      : "min-w-[130px] flex-1 px-4 py-1 lg:px-6"
                  }`}
                >
                  <Input
                    ref={desktopSearchLocationInputRef}
                    className="!type-body-t2 h-auto w-full min-w-0 border-0 bg-transparent pl-1 pr-4 font-semibold text-[#333] shadow-none outline-none placeholder:type-body-t2 placeholder:text-[#333] focus-visible:ring-0"
                    type="text"
                    placeholder="Location"
                    value={locationInput}
                    onChange={(e) => {
                      setLocationInput(e.target.value);
                      if (!e.target.value) {
                        setSelectedLocation("");
                        setSearchCity("");
                        setSearchProvince("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelectedLocation(locationInput);
                      }
                    }}
                  />
                </div>
                <div
                  className={`flex flex-nowrap items-center transition-all duration-300 ${isStuck ? "gap-1 lg:gap-2" : "hide-scrollbar gap-2 overflow-x-auto overflow-y-hidden lg:gap-4"}`}
                >
                  <button
                    className={`type-button-b1 flex items-center justify-center gap-1 whitespace-nowrap rounded-full border bg-transparent font-semibold transition-all lg:gap-2 ${
                      isStuck ? "px-2 py-1.5 lg:px-3" : "px-4 py-2 lg:px-6"
                    } ${
                      postFilterType === "wish"
                        ? "border-[#fbe9e7] bg-[#fbe9e7] text-megaweave-forest-dark"
                        : "border-gray-300 text-[#333]"
                    }`}
                    onClick={() =>
                      setPostFilterType((prev) =>
                        prev === "wish" ? "" : "wish",
                      )
                    }
                  >
                    Wish Only{" "}
                    <ElfIcon className="h-4 w-4 shrink-0 text-[#CB5E32]" />
                  </button>
                  <button
                    className={`type-button-b1 flex items-center justify-center gap-1 whitespace-nowrap rounded-full border bg-transparent font-semibold transition-all lg:gap-2 ${
                      isStuck ? "px-2 py-1.5 lg:px-3" : "px-4 py-2 lg:px-6"
                    } ${
                      postFilterType === "share"
                        ? "border-[#fff3e0] bg-[#fff3e0] text-megaweave-forest-dark"
                        : "border-gray-300 text-[#333]"
                    }`}
                    onClick={() =>
                      setPostFilterType((prev) =>
                        prev === "share" ? "" : "share",
                      )
                    }
                  >
                    Share Only{" "}
                    <ReuseIcon className="h-4 w-4 shrink-0 text-[#F0AF1E]" />
                  </button>
                  <button
                    className={`type-button-b1 flex items-center justify-center whitespace-nowrap rounded-full border bg-transparent font-semibold transition-all ${
                      isStuck ? "px-2 py-1.5 lg:px-3" : "px-4 py-2 lg:px-6"
                    } ${
                      hideOverdue
                        ? "border-[#ffebee] bg-[#ffebee] text-megaweave-red-dark"
                        : "border-gray-300 text-[#333]"
                    }`}
                    onClick={() => setHideOverdue((prev) => !prev)}
                  >
                    Hide Overdue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`mb-4 mt-8 hidden bg-[#f4f5f3] md:block ${isWeavingExpanded ? "z-[60]" : "z-10"}`}
        >
          {/* 全局透明遮罩：當 Weaving 展開時，攔截所有外部點擊並防止事件穿透 */}
          {isWeavingExpanded && (
            <div
              className="fixed inset-0 z-[-1] cursor-default bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsWeavingExpanded(false);
              }}
            />
          )}

          {/* Mirror the Feed wrapper padding so the grid columns align exactly */}
          <div className="mx-auto max-w-7xl px-[20px]">
            {/* Same grid definition as Feed: sm:grid-cols-[repeat(auto-fill,255px)] sm:justify-center */}
            <div className="relative sm:grid sm:grid-cols-[repeat(auto-fill,255px)] sm:justify-center sm:gap-x-6">
              {/* 2 cols (<854px): full | 3+ cols (≥854px): all-except-last
                  854px ≈ 3×255px + 2×24px gap + 20px side padding */}
              <div className="sm:[grid-column:1/-1] min-[854px]:[grid-column:1/-2]">
                <LetsStartWeavingBanner className="h-auto w-full" />
              </div>

              {/* Collapsible Weaving button — only in the last column when 3+ cols */}
              {isStuck && (
                <div className="hidden items-stretch justify-center overflow-visible min-[854px]:flex min-[854px]:[grid-column:-2/-1]">
                  <div
                    ref={weavingButtonRef}
                    onMouseEnter={() => setIsWeavingExpanded(true)}
                    onMouseLeave={() => setIsWeavingExpanded(false)}
                    className="relative flex h-full w-full items-stretch justify-center overflow-visible font-ddin"
                  >
                    {/* Main "+ Weaving" pill button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsWeavingExpanded(!isWeavingExpanded);
                      }}
                      className={`flex h-full w-full items-center justify-center rounded-full bg-megaweave-forest-dark text-3xl font-extrabold tracking-wide text-white transition-all duration-300 ease-in-out ${
                        isWeavingExpanded
                          ? "pointer-events-none z-10 scale-95 opacity-0"
                          : "z-30 scale-100 opacity-100"
                      } `}
                    >
                      + Weaving
                    </button>

                    {/* Expanded sub-buttons — anchored to right, expand left to cover banner */}
                    <div
                      className={`absolute right-0 top-0 flex h-full flex-row items-center gap-3 rounded-full bg-white p-2 text-3xl font-extrabold shadow-md transition-all duration-300 ease-in-out ${
                        isWeavingExpanded
                          ? "pointer-events-auto z-20 scale-x-100 opacity-100"
                          : "pointer-events-none z-0 origin-right scale-x-90 opacity-0"
                      } `}
                    >
                      {/* + Wish */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePostButtonClick("wish");
                          setIsWeavingExpanded(false);
                        }}
                        className="relative flex h-full flex-1 items-center justify-start overflow-hidden rounded-full border-[2px] border-primary-30 bg-primary-15 pl-6 pr-16 tracking-wide text-megaweave-forest-dark transition-colors duration-150 hover:border-primary"
                      >
                        <span className="relative z-10 whitespace-nowrap">
                          + Wish
                        </span>
                        <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex aspect-square shrink-0 items-center justify-center">
                          <ElfIcon className="absolute -bottom-6 -right-4 !h-[95%] !w-full text-megaweave-red-dark" />
                        </div>
                      </button>

                      {/* + Share */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePostButtonClick("share");
                          setIsWeavingExpanded(false);
                        }}
                        className="relative flex h-full flex-1 items-center justify-start overflow-hidden rounded-full border-[2px] border-primary-30 bg-primary-15 pl-6 pr-16 tracking-wide text-megaweave-forest-dark transition-colors duration-150 hover:border-primary"
                      >
                        <span className="relative z-10 whitespace-nowrap">
                          + Share
                        </span>
                        <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex aspect-square shrink-0 items-center justify-center">
                          <ReuseIcon className="absolute -bottom-6 -right-4 !h-[95%] !w-full text-megaweave-gold" />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 md:hidden lg:px-8">
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
        <RefractiveDiv
          className={`sticky z-20 mx-auto flex max-w-7xl flex-col px-8 pb-[20px] pt-[20px] transition-all duration-150 md:hidden ${
            isNavbarVisible ? "top-[80px]" : "top-[0px]"
          } `}
          refraction={{
            radius: 40,
            blur: 4,
            bezelWidth: 20,
          }}
        >
          <div className="flex w-full items-center justify-between">
            <Button
              id="tour-wish"
              className="mr-[10px] border-[2px] border-megaweave-red-light bg-megaweave-red-dark py-[32px] text-[#efd0c4] shadow-none duration-150"
              onClick={() => {
                handleCreatePostButtonClick("wish");
              }}
            >
              + Wish
              <ElfIcon className="!h-[18px] !w-[18px] text-[#efd0c4]" />
            </Button>
            <Button
              id="tour-share"
              className="border-[2px] border-megaweave-gold-light bg-megaweave-gold py-[32px] text-[#fbe7c6] shadow-none duration-150"
              onClick={() => {
                handleCreatePostButtonClick("share");
              }}
            >
              + Share
              <ReuseIcon className="!h-[18px] !w-[18px] text-[#fbe7c6]" />
            </Button>
          </div>

          {/* Active Category Filter Tag - Sticky underneath buttons */}
          <div className="mt-2 flex flex-wrap justify-start gap-2">
            {selectedCategory && (
              <Badge
                className="flex cursor-pointer items-center gap-2 bg-primary-75 py-2 pl-3 pr-2 text-sm text-white transition-colors"
                onClick={() => setSelectedCategory("")}
              >
                <span>
                  Category:{" "}
                  {categories.find((c) => c.id.toString() === selectedCategory)
                    ?.name_en || "Unknown"}
                </span>
                <X className="h-3 w-3 transition-colors hover:text-red-300" />
              </Badge>
            )}
            {searchProvince && (
              <Badge
                className="flex cursor-pointer items-center gap-2 bg-primary-75 py-2 pl-3 pr-2 text-sm text-white transition-colors"
                onClick={() => {
                  setSearchProvince("");
                  // Clear location input if it matches ONLY this province to avoid confusion
                  // But usually user wants to clear the specific filter.
                  // For now, allow independent clearing.
                }}
              >
                <span>Province: {searchProvince}</span>
                <X className="h-3 w-3 transition-colors hover:text-red-300" />
              </Badge>
            )}
            {searchCity && (
              <Badge
                className="flex cursor-pointer items-center gap-2 bg-primary-75 py-2 pl-3 pr-2 text-sm text-white transition-colors"
                onClick={() => {
                  setSearchCity("");
                }}
              >
                <span>City: {searchCity}</span>
                <X className="h-3 w-3 transition-colors hover:text-red-300" />
              </Badge>
            )}
            {selectedLocation && (
              <Badge
                className="flex cursor-pointer items-center gap-2 bg-primary-75 py-2 pl-3 pr-2 text-sm text-white transition-colors"
                onClick={() => {
                  setSelectedLocation("");
                  setLocationInput(""); // Clear the input too as it's likely a direct text search
                }}
              >
                <span>Location: {selectedLocation}</span>
                <X className="h-3 w-3 transition-colors hover:text-red-300" />
              </Badge>
            )}
            {/* If we have specific route filter via handleLocationClick, we might want to show it.
                But based on current code, 'selectedLocation' holds the general text or precise location string
                sent to backend as 'location' param if city/province are not enough or as supplement.
                The handleLocationClick below will set 'selectedLocation' for 'route' click.
             */}
          </div>
        </RefractiveDiv>
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
                  className="fixed bottom-24 left-8 right-8 z-[60] origin-bottom-right flex-col rounded-[30px] rounded-br-none bg-megaweave-forest-dark/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-[3px] sm:left-auto"
                  onClick={(e) => e.stopPropagation()}
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
                      <DeleteIcon className="h-[18px] w-[18px]" />
                    </button>
                  </div>

                  {/* Filter Buttons Row 1 */}
                  <div className="mb-4 flex flex-col gap-[10px]">
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
                        className="w-full text-megaweave-forest-dark"
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
                  <div className="mb-4 flex gap-[10px]">
                    <Button
                      className={`flex-1 ${
                        postFilterType == "wish" ? "bg-primary-50" : "bg-white"
                      } flex items-center justify-center gap-2 px-1 text-megaweave-forest-dark`}
                      onClick={() => {
                        if (postFilterType == "wish") {
                          setPostFilterType("");
                        } else setPostFilterType("wish");
                      }}
                    >
                      Wish Only
                      <ElfIcon className="h-5 w-5 flex-shrink-0" />
                    </Button>
                    <Button
                      className={`flex-1 ${
                        postFilterType == "share" ? "bg-primary-50" : "bg-white"
                      } flex items-center justify-center gap-2 px-1 text-megaweave-forest-dark`}
                      onClick={() => {
                        if (postFilterType == "share") {
                          setPostFilterType("");
                        } else setPostFilterType("share");
                      }}
                    >
                      Share Only
                      <ReuseIcon className="h-5 w-5 flex-shrink-0" />
                    </Button>
                  </div>

                  {/* Close Overdue Items Button */}
                  <Button
                    className={`w-full border font-semibold ${
                      hideOverdue
                        ? "border-[#ffebee] bg-[#ffebee] text-megaweave-red-dark hover:bg-red-100"
                        : "border-transparent bg-white text-megaweave-forest-dark hover:bg-gray-100"
                    }`}
                    onClick={() => setHideOverdue((prev) => !prev)}
                  >
                    Hide Overdue
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <RefractiveButton
            ref={searchButtonRef}
            onClick={() => {
              setIsMenuOpen((pref) => !pref);
            }}
            className={
              "fixed bottom-6 right-8 z-50 flex h-[60px] w-[70px] items-center justify-center rounded-[30px] bg-megaweave-forest-dark/30 p-0 shadow-lg transition-colors duration-300"
            }
            refraction={{
              radius: 20,
              blur: 2,
              bezelWidth: 20,
            }}
          >
            <SearchIcon className="text-white" />
          </RefractiveButton>
        </>
        {/* Error message and posts*/}
        <div className="mx-auto max-w-7xl px-[20px] pb-6">
          {/* 錯誤提示 */}

          {/* 下拉刷新時顯示的頂部 Spinner (不會隱藏 Feed) */}
          {refreshing && (
            <div className="flex animate-in justify-center py-4 transition-all fade-in slide-in-from-top-4">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
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
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div id="tour-feed" className="w-full">
              <Feed
                posts={posts}
                conditions={conditions}
                onPostClick={handleFeedPostClick}
                weaves={[]} // 這裡先傳空陣列，因為還沒從後端抓 weaves
                onCategoryClick={handleFeedCategoryClick}
                onTypeFilterClick={handleFeedTypeFilterClick}
                onLocationClick={handleFeedLocationClick}
                hasMore={hasMore}
                onLoadMore={() => {
                  if (!isValidating && hasMore) {
                    setSize(size + 1);
                  }
                }}
              />
            </div>
          )}
        </div>
        {/* Create Post */}
        <PostFormModal
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          title={postType}
          submitButtonText="Post"
          isSubmitting={isCreating}
          onSubmit={handleCreatePost}
        />
      </div>
    </>
  );
};

export default PostsApp;
