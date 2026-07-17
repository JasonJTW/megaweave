// app/profile/[uuid]/page.tsx
"use client";

import Drawer from "@/app/components/Drawer";
import type { Post, UserStats } from "@/app/types/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import renderTextWithUrls from "@/utils/renderTextWithUrl";
import { motion } from "framer-motion";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
// import type { Weave } from "@/services/weaveService";
import { usePost } from "@/app/contexts/PostContext";
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
// 定義公開 Profile 的資料型別
interface PublicProfile {
  user_id: string;
  username: string;
  avatar_url?: string;
  avatar_key?: string;
  role: string;
  created_at: string;
  bio?: string;
  contact_email?: string | null;
  contact_phone?: string | null;
}

const PublicProfilePage = () => {
  const params = useParams();
  const router = useRouter();
  const uuid = params.uuid as string;
  const { conditions } = usePost();
  const defaultStats: UserStats = {
    postCount: 0,
    weaveCount: 0,
    points: 0,
  };
  const [profileData, setProfileData] = useState<PublicProfile | null>(null);
  const [isContributor, setIsContributor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  //* --- 新增 State 用於 Drawer ---
  const [posts, setPosts] = useState<Post[]>([]);
  // const [weaves, setWeaves] = useState<Weave[]>([]);
  const [stats, setStats] = useState<UserStats>(defaultStats);

  useEffect(() => {
    if (uuid) {
      const init = async () => {
        setLoading(true);
        // 使用 Promise.all 同時發送請求，加快載入速度
        await Promise.all([
          fetchPublicProfile(uuid), // 原本的：抓個資
          fetchStatsAndPosts(uuid), // 新增：抓 Posts (Share/Wish)
          // fetchPublicWeaves(uuid), // 新增：抓 Weaves
        ]);
        setLoading(false);
      };
      init();
    }
  }, [uuid]);

  const fetchPublicProfile = async (userId: string) => {
    try {
      const response = await fetch(
        `${hostName}/api/userprofile/public/${userId}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errorMessage || "Profile not found");
      }

      const data: PublicProfile = await response.json();
      console.log("Fetched public profile:", data);

      setProfileData(data);

      if (data.role === "contributor" || data.role === "admin") {
        setIsContributor(true);
      }
      setError(null);
    } catch (error) {
      console.error("Error fetching profile:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load profile",
      );
    }
    // 注意：這裡不設定 setLoading(false)，交給 init 統一處理
  };

  // --- 2. 新增：從 Stats API 獲取 Posts ---
  const fetchStatsAndPosts = async (userId: string) => {
    try {
      // 利用 stats.ts 裡面的 /public/:uuid 路由
      const response = await fetch(
        `${hostName}/api/user/stats/public/${userId}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Fetched stats: ", data);
        // stats API 回傳結構中有 posts 陣列
        setPosts(data.posts || []);
        setStats({
          postCount: data.postCount || 0,
          weaveCount: data.weaveCount || 0,
          points: data.points || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching public posts:", error);
    }
  };

  // --- 3. 新增：獲取 Weaves ---
  // const fetchPublicWeaves = async (userId: string) => {
  //   try {
  //     // 呼叫我們將在 weaves.ts 新增的公開路由
  //     const response = await fetch(`${hostName}/api/weaves/public/${userId}`, {
  //       method: "GET",
  //       cache: "no-store",
  //     });

  //     if (response.ok) {
  //       const data = await response.json();
  //       console.log("Fetched public weaves: ", data.weaves);
  //       setWeaves(data.weaves || []);
  //     }
  //   } catch (error) {
  //     console.error("Error fetching public weaves:", error);
  //   }
  // };

  // --- 篩選 Posts ---
  const sharePosts = posts.filter((post) => post.type === "share");
  const wishPosts = posts.filter((post) => post.type === "wish");

  // Loading state
  if (loading) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-megaweave-forest-dark"></div>
        <div className="flex min-h-screen items-center justify-center bg-megaweave-forest-dark">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-megaweave-gold/30 border-t-megaweave-red-light"></div>
            <h1 className="text-2xl font-medium text-megaweave-cream">
              Loading...
            </h1>
          </motion.div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-megaweave-brown"></div>
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
          <Alert className="max-w-md border-red-500/30 bg-red-950/50">
            <AlertDescription className="text-red-300">
              {error}
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  // No profile data
  if (!profileData) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-megaweave-brown"></div>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-400">No profile data available</p>
        </div>
      </>
    );
  }

  // Main render
  return (
    <>
      <div className="fixed inset-0 -z-10 bg-primary-5 font-ddin"></div>
      <div className="min-h-screen px-0 sm:px-6 md:px-12 lg:px-16">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 py-4"
        >
          <div className="flex min-w-full items-start">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="w-8 p-4 text-left"
            >
              <ArrowLeft className="h-8 w-8" />
            </Button>
          </div>
        </motion.header>

        {/* Main Content */}
        <div className="mx-auto max-w-6xl px-6 py-5 font-ddin">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="rounded-[30px] border border-primary-30 bg-white p-6 transition-all duration-300 hover:border-gray-600/40">
                {/* Avatar */}
                <div className="mb-6 text-center">
                  <div className="relative mx-auto mb-2 flex h-80 max-h-80 w-full max-w-72 items-center justify-center overflow-hidden rounded-2xl bg-secondary/50 text-2xl font-bold shadow-lg shadow-blue-500/20">
                    {profileData.avatar_url ? (
                      <div className="absolute inset-0">
                        <Image
                          src={profileData.avatar_url}
                          alt={`${profileData.username} avatar`}
                          fill
                          sizes="(max-width: 1024px) 300px, 288px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-6xl text-gray-400">
                        {profileData.username?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                </div>

                {/* User Info */}
                <div className="space-y-3 text-center">
                  <h2
                    className="text-xl font-bold text-[#222]"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2, // 最多顯示兩行
                      WebkitBoxOrient: "vertical",
                      wordBreak: "break-word",
                    }}
                  >
                    {profileData.username}
                  </h2>

                  {/* Role Badge */}
                  <div className="flex justify-center">
                    <span className="inline-flex items-center rounded-full border-[.5px] border-megaweave-red-light bg-megaweave-red-dark/40 px-4 py-2 text-sm font-medium text-white">
                      {profileData.role}
                    </span>
                  </div>

                  {/* Contributor Badge */}
                  {isContributor && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className="relative mt-4 rounded-lg bg-gradient-to-r from-megaweave-blue/10 to-megaweave-blue-light/10 p-3"
                      style={{
                        border: "2px solid #3b82f6",
                        boxShadow: `
                          0 0 20px rgba(59, 130, 246, 0.6),
                          0 0 40px rgba(147, 51, 234, 0.4),
                          0 0 60px rgba(236, 72, 153, 0.3),
                          inset 0 0 0 2px rgba(255, 255, 255, 0.1)
                        `,
                      }}
                    >
                      <div className="flex items-center justify-center space-x-4">
                        <Image
                          src="/favicon2.ico"
                          alt="contributor-badge"
                          width={20}
                          height={20}
                          unoptimized
                        />
                        <p className="text-md font-ddin font-bold tracking-widest text-megaweave-blue-light">
                          Contributor
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Stats (Optional - 可以移除或改成真實數據) */}
                {/* Stats */}
                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                  <div className="flex flex-col items-center justify-center rounded-[15px] border border-primary-30 bg-white px-[18px] py-[14px]">
                    <div className="type-h3 text-[#222]">
                      {String(stats.postCount).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 mt-[2px] font-semibold text-[#222]">
                      post
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-[15px] border border-primary-30 bg-white px-[18px] py-[14px]">
                    <div className="type-h3 text-[#222]">
                      {String(stats.weaveCount).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 mt-[2px] font-semibold text-[#222]">
                      weaved
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-[15px] border border-primary-30 bg-white px-[18px] py-[14px]">
                    <div className="type-h3 text-[#222]">
                      {String(stats.points).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 mt-[2px] font-semibold text-[#222]">
                      point
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Bio & Contact Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-6 lg:col-span-2"
            >
              {/* Bio Section */}
              <div className="rounded-2xl border border-primary-30 bg-white p-6 transition-all duration-300 hover:border-gray-600/40">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="flex items-center space-x-2 text-xl font-semibold">
                    <UserIcon className="h-5 w-5 text-megaweave-forest-dark" />
                    <div className="type-button-b1 text-megaweave-forest-dark">
                      About Me
                    </div>
                  </h3>
                </div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="whitespace-pre-line break-words leading-relaxed text-primary"
                >
                  {profileData.bio ? (
                    renderTextWithUrls(profileData.bio)
                  ) : (
                    <span className="italic text-gray-500">
                      No bio available
                    </span>
                  )}
                </motion.p>
              </div>

              {/* Contact Information */}
              {/* {(profileData.contact_email || profileData.contact_phone) && ( */}
              {/* <div className="bg-white  border border-primary-30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
                  <div className="flex items-center mb-6">
                    <h3 className="text-xl font-semibold flex items-center space-x-2">
                      <Contact className="w-5 h-5" />
                      <span>Contact Information</span>
                    </h3>
                  </div>

                  <div className="space-y-4">

                    {profileData.contact_email && (
                      <div className="p-4 bg-megaweave-blue/10 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Mail className="w-5 h-5 text-blue-400" />
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Email</p>
                            <a
                              href={`mailto:${profileData.contact_email}`}
                              className="text-gray-200 hover:text-blue-400 transition-colors break-all"
                            >
                              {profileData.contact_email}
                            </a>
                          </div>
                        </div>
                      </div>
                    )}


                    {profileData.contact_phone && (
                      <div className="p-4 bg-megaweave-blue/10 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Phone className="w-5 h-5 text-green-400" />
                          <div>
                            <p className="text-sm text-gray-400 mb-1">Phone</p>
                            <a
                              href={`tel:${profileData.contact_phone}`}
                              className="text-gray-200 hover:text-green-400 transition-colors"
                            >
                              {profileData.contact_phone}
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div> */}
              {/* )} */}

              {/* --- 4. 顯示 Drawers --- */}
              {/* <Drawer
                title="Weaving"
                posts={[]}
                weaves={weaves}
                conditions={conditions}
              /> */}
              <Drawer
                title="Share"
                posts={sharePosts}
                conditions={conditions}
              />
              <Drawer title="Wish" posts={wishPosts} conditions={conditions} />
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PublicProfilePage;
