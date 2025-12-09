"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import User from "../types/user";
import { Post, UserStats } from "../types/schema";
import { googleLogout } from "@react-oauth/google";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User as UserIcon, LogOut, Save, X } from "lucide-react";
// import { useForm } from "react-hook-form";
// import {
//   Form,
//   FormControl,
//   FormField,
//   FormItem,
//   FormLabel,
// } from "@/components/ui/form";
// import { Switch } from "@/components/ui/switch";
import Image from "next/image";
import renderTextWithUrls from "@/utils/renderTextWithUrl";
import MemberForm from "../memberForm";
import { useTeam } from "../contexts/TeamContext";
import ElfIcon from "../components/icons/ElfIcon";
import ReuseIcon from "../components/icons/ReuseIcon";
import CommonShareIcon from "../components/icons/CommonShareIcon";
import WeavingIcon from "../components/icons/WeavingIcon";
// import UserPageDecoLine from "../components/Deco/UserPageDecoLine";
import EditIcon from "../components/icons/EditIcon";
import Drawer from "../components/Drawer";
import { usePost } from "../contexts/PostContext";
import type { Weave } from "@/services/weaveService";
// 定義表單資料型別（無需 zod）
// type ContactSettingsValues = {
//   email?: string; // 可選填的電子郵件
//   phone?: string; // 可選填的電話號碼
//   emailVisible: boolean; // 是否公開 toggle
//   phoneVisible: boolean;
// };

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
const processHostName = process.env.NEXT_PUBLIC_PROCESS_HOSTNAME;
const userNameMaxLength =
  Number(process.env.NEXT_PUBLIC_USERNAME_MAX_LENGTH) || 30;

// const defaultContactValues: ContactSettingsValues = {
//   email: "",
//   phone: "",
//   emailVisible: false,
//   phoneVisible: false,
// };

const defaultStats: UserStats = {
  postCount: 0,
  weaveCount: 0,
  points: 0,
};

const UserPage = () => {
  //* Get user data from cookie session
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContributor, setIsContributor] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  // const [contactEmail, setContactEmail] = useState("");
  // const [contactPhone, setContactPhone] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  // const [isEditingContact, setIsEditingContact] = useState(false);
  const [tempBio, setTempBio] = useState("");
  const [tempUsername, setTempUsername] = useState("");
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const router = useRouter();
  const { refetchTeamMembers } = useTeam();
  const [posts, setPosts] = useState<Post[]>([]);
  const [weaves, setWeaves] = useState<Weave[]>([]);
  const { conditions } = usePost();

  // Avatar preview / upload states
  const [previewSrc, setPreviewSrc] = useState<string | null>(null); // object URL for preview
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(
    null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewRef = useRef<string | null>(null); // store previous object URL so we can revoke it
  const searchParams = useSearchParams();
  const highlightWeaveId = searchParams.get("highlightWeaveId");
  // const contactForm = useForm<ContactSettingsValues>({
  //   defaultValues: defaultContactValues,
  // });

  // const onContactFormSubmit = (data: ContactSettingsValues) => {
  //   console.log("Contact settings updated:", data);
  //   // 這裡可以添加 API 調用來保存設定
  // };

  const fetchWithTimeout = async (
    url: string,
    options: RequestInit,
    timeout = 10000
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout - Server may be unavailable");
      }
      throw error;
    }
  };

  const fetchUser = async () => {
    try {
      const response = await fetchWithTimeout(
        `${hostName}/api/currentUser`,
        {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        },
        10000 //? 10 seconds timeout
      );

      if (!response.ok) {
        if (response.status === 401) {
          setLoading(false);
          setRedirecting(true);
          router.push("/signin");
          return false;
        }

        // 處理 500 等伺服器錯誤
        if (response.status >= 500) {
          setError("Server is currently unavailable. Please try again later.");
          setLoading(false);
          return false;
        }

        const errorMessage = await response.json();
        throw new Error(
          errorMessage.errorMessage || "Failed to fetch user data"
        );
      }

      const userData = await response.json();
      console.log("Fetched User: ", userData);
      setUser(userData.user);
      setUsername(userData.user.username);
      if (
        userData.user.role === "contributor" ||
        userData.user.role === "admin"
      ) {
        setIsContributor(true);
      }
      setLoading(false);
      setError(null);
      return true;
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
      setLoading(false);
      return false;
    }
  };

  const getBio = async () => {
    const response = await fetch(`${hostName}/api/userprofile/bio`, {
      cache: "no-store",
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const result = await response.json();
      console.error("Error fetching userprofile:", result.errorMessage);
      setError(result.errMessage);
      return;
    }
    const result = await response.json();
    const bioValue = result.bio || "";
    setBio(bioValue);
  };

  const getUsername = async () => {
    const response = await fetch(`${hostName}/api/userprofile/custom_name`, {
      cache: "no-store",
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      console.error("Error fetching userprofile:", error.errorMessage);
      setError(error.errMessage);
      return;
    }

    const result = await response.json();
    console.log("get custom_name:", result.custom_name);
    setUsername(result.custom_name);
  };

  const fetchStats = async () => {
    try {
      const response = await fetchWithTimeout(
        `${hostName}/api/user/stats`,
        {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        },
        10000 //? 10 seconds timeout
      );

      if (!response.ok) {
        const errorMessage = await response.json();
        throw new Error(
          errorMessage.errorMessage || "Failed to fetch user stats"
        );
      }
      const statsData = await response.json();
      const postsData = statsData.posts || [];
      setPosts(postsData);
      console.log("Fetched User Stats: ", statsData);

      setStats({
        postCount: statsData.postCount || 0,
        weaveCount: statsData.weaveCount || 0,
        points: statsData.points || 0,
      });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      // 這裡可以選擇不設置錯誤，讓 stats 保持為 defaultStats (0, 0, 0)
    }
  };

  const fetchWeaves = async () => {
    try {
      const response = await fetchWithTimeout(
        `${hostName}/api/weaves`, // 預設抓取所有相關 (giver + receiver)
        {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        },
        10000
      );

      if (!response.ok) {
        // 如果不是 200，僅 log 錯誤但不阻擋頁面渲染 (非核心致命錯誤)
        console.warn("Failed to fetch weaves history");
        return;
      }

      const data = await response.json();
      console.log("Fetched Weaves:", data.weaves);
      setWeaves(data.weaves || []);
    } catch (error) {
      console.error("Error fetching weaves:", error);
    }
  };

  // --- Avatar: 使用者先預覽，確認後才上傳 ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    // validation (example: limit 5MB)
    const maxSizeMB = 5;
    if (file.size / 1024 / 1024 > maxSizeMB) {
      setError(`Selected file is larger than ${maxSizeMB} MB`);
      // clear input
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // revoke previous object URL if exists
    if (previousPreviewRef.current) {
      try {
        URL.revokeObjectURL(previousPreviewRef.current);
      } catch (err) {
        console.log("Error revoking previous object URL", err);
      }
    }

    const url = URL.createObjectURL(file);
    previousPreviewRef.current = url;
    setPreviewSrc(url);
    setSelectedAvatarFile(file);
    setError(null);
  };

  const handleCancelAvatarPreview = () => {
    if (previousPreviewRef.current) {
      try {
        URL.revokeObjectURL(previousPreviewRef.current);
      } catch (err) {
        console.log("Error revoking previous object URL", err);
      }
      previousPreviewRef.current = null;
    }
    setPreviewSrc(null);
    setSelectedAvatarFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // optional: client-side resize/compress (commented - keep if you want)
  // async function compressImage(
  //   file: File,
  //   maxWidth = 1200,
  //   maxHeight = 1200,
  //   quality = 0.85
  // ) {
  //   return new Promise<Blob | null>((resolve) => {
  //     const img = new Image();
  //     img.onload = () => {
  //       const canvas = document.createElement("canvas");
  //       let { width, height } = img;
  //       if (width > maxWidth) {
  //         height = (maxWidth / width) * height;
  //         width = maxWidth;
  //       }
  //       if (height > maxHeight) {
  //         width = (maxHeight / height) * width;
  //         height = maxHeight;
  //       }
  //       canvas.width = width;
  //       canvas.height = height;
  //       const ctx = canvas.getContext("2d");
  //       if (!ctx) return resolve(null);
  //       ctx.drawImage(img, 0, 0, width, height);
  //       canvas.toBlob(
  //         (blob) => {
  //           resolve(blob);
  //         },
  //         "image/jpeg",
  //         quality
  //       );
  //     };
  //     img.onerror = () => resolve(null);
  //     img.src = URL.createObjectURL(file);
  //   });
  // }

  const updateUserSession = async (updates: Partial<User>) => {
    if (!updates || Object.keys(updates).length === 0) return;
    // console.log("Sending updates:", updates);
    // console.log("Body:", JSON.stringify({ updates: updates }));
    try {
      const response = await fetch(`${hostName}/api/currentUser/update`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ updates: updates }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.errorMessage || "Failed to update user session");
        throw new Error(result.errorMessage || "Failed to update user session");
      }
      const result = await response.json();
      const updatedUser = result.updatedUser;
      // alert(`User session updated: ${JSON.stringify(updatedUser)}`);
      setUser(updatedUser);
    } catch (error) {
      console.error("Error updating user session:", error);
    }
  };

  const uploadAvatar = async () => {
    if (!selectedAvatarFile) return;

    setUploadingAvatar(true);
    setError(null);

    try {
      // Optional: compress before upload (uncomment if desired)
      // const compressedBlob = await compressImage(selectedAvatarFile, 1200, 1200, 0.8);
      // const fileToUpload = compressedBlob ? new File([compressedBlob], selectedAvatarFile.name, { type: "image/jpeg" }) : selectedAvatarFile;
      const formData = new FormData();
      formData.append("image", selectedAvatarFile);

      const processedResponse = await fetch(`${processHostName}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!processedResponse.ok) {
        throw new Error(`Processing failed: ${processedResponse.status}`);
      }

      const processedBlob: Blob = await processedResponse.blob();

      const processedFormData = new FormData();
      processedFormData.append(
        "avatar",
        processedBlob,
        selectedAvatarFile.name || "avatar.png"
      );

      //* Upload to db
      const response = await fetch(`${hostName}/api/avatar`, {
        method: "POST",
        credentials: "include",
        body: processedFormData,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorMessage || "Failed to upload avatar");
      }

      const result = await response.json();
      console.log("Avatar uploaded successfully:", result);

      // 更新本地 user 狀態 (顯示新的頭像)
      setUser((prev) =>
        prev
          ? {
              ...prev,
              avatar_url: result.avatarUrl,
              avatar_key: result.avatarKey,
            }
          : prev
      );

      // 清除 preview
      if (previousPreviewRef.current) {
        try {
          URL.revokeObjectURL(previousPreviewRef.current);
        } catch (err) {
          console.log("Error revoking previous object URL", err);
        }
        previousPreviewRef.current = null;
      }
      setPreviewSrc(null);
      setSelectedAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      //* Update user session in redis
      await updateUserSession({
        avatar_url: result.avatarUrl,
        avatar_key: result.avatarKey,
      });

      //* If user is contributor/admin, refetch team members to update avatar
      if (isContributor) {
        await refetchTeamMembers();
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 其餘 API helpers 保持原樣
  const insertUsername = async (custom_name: string) => {
    try {
      const response = await fetch(`${hostName}/api/userprofile/custom_name`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          custom_name: custom_name,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(`Failed to update username: ${result.errorMessage}`);
      }
      const result = await response.json();
      console.log("Update username Success: ", result);
    } catch (error) {
      console.error("Error update username: ", error);
      setError(
        error instanceof Error ? error.message : "Error update username"
      );
      throw error;
    }
  };

  const insertBio = async (bio: string) => {
    try {
      const response = await fetch(`${hostName}/api/userprofile/bio`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bio: bio,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error("Failed to update profile: ", result.errorMessage);
      }
      const result = await response.json();
      console.log("Update profile Success: ", result);
    } catch (error) {
      console.error("Error update profile: ", error);
      setError(error instanceof Error ? error.message : "Error update profile");
      throw error;
    }
  };

  // const insertContactEmail = async (contactEmail: string) => {
  //   try {
  //     const response = await fetch(
  //       `${hostName}/api/userprofile/contact_email`,
  //       {
  //         cache: "no-store",
  //         method: "POST",
  //         credentials: "include",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           contact_email: contactEmail,
  //         }),
  //       }
  //     );
  //     if (!response.ok) {
  //       const result = await response.json();
  //       throw new Error("Failed to update profile: ", result.errorMessage);
  //     }
  //     const result = await response.json();
  //     console.log("Update profile Success: ", result);
  //   } catch (error) {
  //     console.error("Error update profile: ", error);
  //     setError(
  //       error instanceof Error ? error.message : "Error update contact email"
  //     );
  //     throw error;
  //   }
  // };

  // const insertContactPhone = async (contactPhone: string) => {
  //   try {
  //     const response = await fetch(
  //       `${hostName}/api/userprofile/contact_phone`,
  //       {
  //         cache: "no-store",
  //         method: "POST",
  //         credentials: "include",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           contact_phone: contactPhone,
  //         }),
  //       }
  //     );
  //     if (!response.ok) {
  //       const result = await response.json();
  //       throw new Error("Failed to update profile: ", result.errorMessage);
  //     }
  //     const result = await response.json();
  //     console.log("Update profile Success: ", result);
  //   } catch (error) {
  //     console.error("Error update profile: ", error);
  //     setError(
  //       error instanceof Error ? error.message : "Error update contact phone"
  //     );
  //     throw error;
  //   }
  // };

  // const getContactEmail = async () => {
  //   const response = await fetch(`${hostName}/api/userprofile/contact_email`, {
  //     cache: "no-store",
  //     method: "GET",
  //     credentials: "include",
  //   });
  //   if (!response.ok) {
  //     const result = await response.json();
  //     console.error("Error fetching userprofile:", result.errorMessage);
  //     setError(result.errMessage);
  //     return;
  //   }
  //   const result = await response.json();
  //   const emailValue = result.contactEmail || "";
  //   setContactEmail(emailValue);
  //   contactForm.setValue("email", emailValue);
  // };

  // const getContactPhone = async () => {
  //   const response = await fetch(`${hostName}/api/userprofile/contact_phone`, {
  //     cache: "no-store",
  //     method: "GET",
  //     credentials: "include",
  //   });
  //   if (!response.ok) {
  //     const result = await response.json();
  //     console.error("Error fetching userprofile:", result.errorMessage);
  //     setError(result.errMessage);
  //     return;
  //   }
  //   const result = await response.json();
  //   const phoneValue = result.contactPhone || "";
  //   setContactPhone(phoneValue);
  //   contactForm.setValue("phone", phoneValue);
  // };

  const handleSaveBio = () => {
    setBio(tempBio);
    setIsEditingBio(false);

    // Add API call to save bio
    insertBio(tempBio);
  };

  const handleCancelBio = () => {
    setTempBio(bio);
    setIsEditingBio(false);
  };

  const handleEditBio = () => {
    setTempBio(bio);
    setIsEditingBio(true);
  };

  // const handleSaveContact = async () => {
  //   const formData = contactForm.getValues();
  //   console.log("Contact form data:", formData);

  //   try {
  //     if (formData.email !== contactEmail) {
  //       await insertContactEmail(formData.email || "");
  //     }
  //     if (formData.phone !== contactPhone) {
  //       await insertContactPhone(formData.phone || "");
  //     }
  //     setContactEmail(formData.email || "");
  //     setContactPhone(formData.phone || "");
  //     setError(null);
  //     setIsEditingContact(false);
  //   } catch (error) {
  //     console.error("Error saving contact info:", error);
  //     setError(
  //       error instanceof Error ? error.message : "Error saving contact info"
  //     );
  //   }
  // };

  // const handleCancelContact = () => {
  //   contactForm.setValue("email", contactEmail);
  //   contactForm.setValue("phone", contactPhone);
  //   setIsEditingContact(false);
  // };

  // const handleEditContact = () => {
  //   contactForm.reset({
  //     email: contactEmail,
  //     phone: contactPhone,
  //     emailVisible: contactForm.getValues("emailVisible"),
  //     phoneVisible: contactForm.getValues("phoneVisible"),
  //   });
  //   setIsEditingContact(true);
  // };

  const handleSaveUsername = async () => {
    try {
      setUsername(tempUsername);
      setIsEditingUsername(false);
      await insertUsername(tempUsername);
      // 同时更新 user 对象中的 username
      if (user) {
        setUser({ ...user, username: tempUsername });
        setError(null);
      }
    } catch (error) {
      console.error("Error saving username:", error);
      // 如果保存失败，恢复原来的值
      setUsername(username || "");
      setTempUsername(username || "");
      setError(
        error instanceof Error ? error.message : "Error saving username"
      );
    }
  };

  const handleCancelUsername = () => {
    setTempUsername(username || user?.username || "");
    setIsEditingUsername(false);
  };

  const handleEditUsername = () => {
    setTempUsername(username || user?.username || "");
    setIsEditingUsername(true);
  };

  const handleRemoveAvatar = async () => {
    try {
      //* Delete avatar from DB
      const res = await fetch(`${hostName}/api/avatar`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.errorMessage || "Failed to remove avatar");
      }
      //* Update user state
      setUser((prev) => (prev ? { ...prev, avatar_url: undefined } : prev));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to remove avatar");
    }
  };

  const handleSignOut = async () => {
    try {
      //* Sign out from Google OAuth
      try {
        googleLogout();
      } catch (googleError) {
        console.warn("Error during Google logout:", googleError);
      }

      //* Sign out from the server
      const response = await fetch(`${hostName}/api/signout`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert("You are not signed in");
          return;
        }

        const errorMessage = await response.json();
        console.error("Error signing out:", errorMessage.errorMessage);
        throw new Error(` ${errorMessage.errorMessage}`);
      }

      console.log("Sign out successful");
      setUser(null);
      setRedirecting(true);
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    }
  };

  useEffect(() => {
    const init = async () => {
      const success = await fetchUser();
      if (success) {
        getBio();
        // getContactEmail();
        // getContactPhone();
        getUsername();
        fetchStats();
        fetchWeaves();
      }
    };
    init();
    return () => {
      // cleanup any created object URLs on unmount
      if (previousPreviewRef.current) {
        try {
          URL.revokeObjectURL(previousPreviewRef.current);
        } catch (err) {
          console.log("Error revoking previous object URL", err);
        }
        previousPreviewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sharePosts = posts.filter((post) => post.type === "share");
  const wishPosts = posts.filter((post) => post.type === "wish");

  if (loading || redirecting) {
    return (
      <>
        <div className="fixed inset-0 bg-megaweave-forest-dark -z-10"></div>
        <div className="min-h-screen bg-megaweave-forest-dark flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="w-16 h-16 border-4 border-megaweave-gold/30 border-t-megaweave-red-light rounded-full animate-spin mx-auto mb-4"></div>
            <h1 className="text-megaweave-cream text-2xl font-medium">
              Loading...
            </h1>
          </motion.div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <Alert className="max-w-md bg-red-950/50 border-red-500/30">
          <AlertDescription className="text-red-300">
            Error fetching user data: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 bg-primary-5 -z-10"></div>
      <div className="min-h-screen  px-0 sm:px-6 md:px-12 lg:px-16">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="  "
        >
          <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-9xl font-ddin font-extrabold tracking-wide"></h1>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2 rounded-full bg-primary/50 transition-all duration-200 border border-primary-30/30 hover:border-primary-30 hover:bg-primary-30/35"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </motion.header>

        {error && (
          <div className="max-w-6xl mx-auto px-6 py-4">
            <Alert className="bg-red-950/50 border-red-500/30"> {error} </Alert>
          </div>
        )}

        {/*icons*/}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center space-x-2 px-6">
            <ReuseIcon className="h-[85px] w-auto text-megaweave-gold" />
            <WeavingIcon className="h-[85px] w-auto text-megaweave-forest" />
            <ElfIcon className="h-[85px] w-auto text-megaweave-red-dark" />
            <CommonShareIcon className="h-[85px] w-auto text-megaweave-blue" />
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-6 py-5 font-ddin">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="bg-white border-primary-30 border rounded-[30px] p-6 hover:border-gray-600/40 transition-all duration-300">
                {/* Avatar */}
                <div className="text-center mb-2 mt-4 ">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="relative">
                    <button
                      className="absolute -top-4 right-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <EditIcon />
                    </button>
                    {/* 固定尺寸容器：保持原本的大小/比例（max-w-72, h-80） */}
                    <div className="w-full max-w-[220px] h-[222px] max-h-80 bg-secondary/50 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2 mx-auto  hover:cursor-pointer relative overflow-hidden">
                      {/* 如果有 preview，顯示 preview 圖片；否則若 user.avatarUrl 存在則顯示真實頭像，否則顯示字母色塊 */}

                      {previewSrc ? (
                        // preview: 使用原生 img 以支援 object URL
                        <img
                          src={previewSrc}
                          alt="Avatar preview"
                          className="w-full h-full object-cover"
                        />
                      ) : user?.avatar_url ? (
                        // 使用 next/image 以獲得優化（父容器需為 relative）
                        <div className="absolute inset-0">
                          <Image
                            src={user.avatar_url}
                            alt={`${username} avatar`}
                            fill
                            sizes="(max-width: 1024px) 222px, 220px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        // fallback 色塊顯示使用者首字母
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          {username ? username.charAt(0) : "?"}
                        </div>
                      )}

                      {/* 如果是正在上傳，顯示 loading overlay */}
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        </div>
                      )}

                      {/* 如果有 preview，顯示 Save / Cancel 按鈕 */}
                      {previewSrc && !uploadingAvatar && (
                        <div className="absolute bottom-3 right-3 flex space-x-2">
                          <button
                            onClick={uploadAvatar}
                            className="px-3 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-sm text-green-400 flex items-center space-x-2"
                          >
                            <Save className="w-4 h-4" />
                            <span>Upload</span>
                          </button>
                          <button
                            onClick={handleCancelAvatarPreview}
                            className="px-3 py-1 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 text-sm text-gray-300 flex items-center space-x-2"
                          >
                            <X className="w-4 h-4" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* file input (hidden) + change 按鈕 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="mt-2 flex items-center justify-center space-x-2">
                    {/* 如果目前沒有 preview，但有 avatarUrl，可以提供 Remove 或 Reset 按鈕（示例） */}
                    {user.avatar_url && !previewSrc && (
                      <button
                        onClick={handleRemoveAvatar}
                        className="px-3 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 transition-all duration-200 text-sm text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* User Info */}
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-2">
                    {!isEditingUsername ? (
                      <motion.div
                        key="display"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="group flex items-center relative px-2"
                      >
                        <h2
                          className="text-[#222] type-h5"
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2, // 最多顯示兩行
                            WebkitBoxOrient: "vertical",
                            wordBreak: "break-word",
                          }}
                        >
                          {username}
                        </h2>
                        <button
                          onClick={handleEditUsername}
                          className="opacity-0 group-hover:opacity-100 transition-opacity  duration-200 p-1 hover:bg-gray-600/30 rounded absolute left-full top-1/2 -translate-y-1/2"
                        >
                          <EditIcon className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="edit"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-center w-full"
                      >
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1, duration: 0.2 }}
                          className="flex mb-1 justify-end w-full space-x-2"
                        >
                          <button
                            onClick={handleSaveUsername}
                            className="p-1 hover:bg-green-600/30 rounded text-green-400 transition-colors duration-200"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelUsername}
                            className="p-1 hover:bg-gray-600/30 rounded text-gray-400 transition-colors duration-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                        <textarea
                          value={tempUsername}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\n/g, ""); // 防止換行
                            if (value.length <= userNameMaxLength) {
                              setTempUsername(value);
                            }
                          }}
                          maxLength={userNameMaxLength}
                          rows={tempUsername.length > 15 ? 2 : 1}
                          className="text-xl font-bold bg-gray-700/30 border border-gray-600/30 rounded px-2 py-1 text-center w-full focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none overflow-hidden"
                          style={{
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            lineHeight: "1.2",
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            // 防止 Enter 鍵換行
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveUsername();
                            }
                          }}
                        />
                      </motion.div>
                    )}
                  </div>

                  <p className="text-gray-400 type-body-t5">{user.email}</p>

                  {/* <UserPageDecoLine className="pt-[18px] pb-[20px]" /> */}

                  {/* Role Badge */}
                  <div className="flex justify-center mt-4">
                    <span
                      className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border-[.5px] border-megaweave-red-light bg-megaweave-red-dark/40 text-white`}
                    >
                      {user.role}
                    </span>
                  </div>

                  {isContributor && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className="mt-4 p-3 bg-gradient-to-r from-megaweave-blue/10 to-megaweave-blue-light/10 rounded-lg relative"
                      style={{
                        border: "2px solid #3b82f6",
                        boxShadow: `
                        0 0 20px rgba(59, 130, 246, 0.6),
                        0 0 40px rgba(147, 51, 234, 0.4),
                        0 0 60px rgba(236, 72, 153, 0.3),
                        inset 0 0 0 2px rgba(255, 255, 255, 0.1)
                      `,
                        animation:
                          "neon-pulse 1s ease-in-out infinite alternate",
                      }}
                    >
                      <div className="flex items-center justify-center space-x-4">
                        <Image
                          src={"/favicon2.ico"}
                          alt="contributor-badge"
                          width={20}
                          height={20}
                        />
                        <p className="text-md text-megaweave-blue-light font-ddin font-bold tracking-widest">
                          Welcome, dear contributor!
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Stats */}
                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                  <div className="flex  flex-col py-[14px] px-[18px] rounded-[15px] border-primary-30 border bg-white items-center justify-center">
                    <div className="type-h3 text-[#222]  ">
                      {String(stats.postCount).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 font-semibold text-[#222] mt-[2px]">
                      post
                    </div>
                  </div>
                  <div className="flex  flex-col py-[14px] px-[18px] rounded-[15px] border-primary-30 border bg-white items-center justify-center">
                    <div className="type-h3 text-[#222] ">
                      {String(stats.weaveCount).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 font-semibold text-[#222] mt-[2px]">
                      weaved
                    </div>
                  </div>
                  <div className="flex  flex-col py-[14px] px-[18px] rounded-[15px] border-primary-30 border bg-white items-center justify-center">
                    <div className="type-h3 text-[#222] ">
                      {String(stats.points).padStart(2, "0")}
                    </div>
                    <div className="type-button-b2 font-semibold text-[#222] mt-[2px]">
                      point
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Bio & Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 space-y-6"
            >
              {/* Bio Section */}
              <div className="bg-white  border border-primary-30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold flex items-center space-x-2">
                    <UserIcon className="w-5 h-5 text-megaweave-forest-dark" />
                    <div className="type-button-b1 text-megaweave-forest-dark">
                      About Me
                    </div>
                  </h3>
                  {!isEditingBio ? (
                    <button
                      onClick={handleEditBio}
                      className="flex items-center px-3 py-1.5 transition-all duration-200"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSaveBio}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 transition-all duration-200 text-sm text-green-400"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </button>
                      <button
                        onClick={handleCancelBio}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 transition-all duration-200 text-sm text-gray-400"
                      >
                        <X className="w-3 h-3" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}
                </div>

                {!isEditingBio ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-primary leading-relaxed whitespace-pre-line break-all"
                  >
                    {renderTextWithUrls(bio)}
                  </motion.p>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <textarea
                      value={tempBio}
                      onChange={(e) => setTempBio(e.target.value)}
                      className="w-full h-32 border type-body-t3 border-gray-600/30 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
                      placeholder="description"
                    />
                  </motion.div>
                )}
              </div>

              {/* Contact Settings */}
              {/* <div className="bg-white border border-primary-30 rounded-2xl p-6  transition-all duration-300">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="type-button-b1 text-megaweave-forest-dark flex items-center space-x-2">
                    <Contact className="w-5 h-5" />
                    <span>Contact Setting</span>
                  </h3>
                  {!isEditingContact ? (
                    <button
                      onClick={handleEditContact}
                      className="flex items-center px-3 py-1.5 transition-all duration-200"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSaveContact}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 transition-all duration-200 text-sm text-green-400"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </button>
                      <button
                        onClick={handleCancelContact}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 transition-all duration-200 text-sm text-gray-400"
                      >
                        <X className="w-3 h-3" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}
                </div>

                <Form {...contactForm}>
                  <form
                    onSubmit={contactForm.handleSubmit(onContactFormSubmit)}
                    className="space-y-6"
                  >

                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-medium text-megaweave-forest">
                            Email
                          </FormLabel>
                        </div>


                        <FormField
                          control={contactForm.control}
                          name="emailVisible"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`text-sm transition-colors duration-200 ${
                                    field.value
                                      ? "text-green-400"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {field.value ? "Public" : "Private"}
                                </span>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="data-[state=checked]:bg-blue-500"
                                  />
                                </FormControl>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>


                      <FormField
                        control={contactForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              {isEditingContact ? (
                                <input
                                  {...field}
                                  type="email"
                                  className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                                />
                              ) : (
                                <div className="text-gray-300 rounded-lg">
                                  {field.value || "No email provided"}
                                </div>
                              )}
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>


                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-medium text-megaweave-forest">
                            Phone
                          </FormLabel>
                        </div>


                        <FormField
                          control={contactForm.control}
                          name="phoneVisible"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`text-sm transition-colors duration-200 ${
                                    field.value
                                      ? "text-green-400"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {field.value ? "Public" : "Private"}
                                </span>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="data-[state=checked]:bg-blue-500"
                                  />
                                </FormControl>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>


                      <FormField
                        control={contactForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              {isEditingContact ? (
                                <input
                                  {...field}
                                  type="phone"
                                  placeholder="Enter your contact phone number"
                                  className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                                />
                              ) : (
                                <div className=" text-gray-300 rounded-lg ">
                                  {field.value || "No phone provided"}
                                </div>
                              )}
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </form>
                </Form>
              </div> */}
            </motion.div>
          </div>
        </div>

        {/* member form */}
        {isContributor && (
          <MemberForm
            isContributor={isContributor}
            memberUserId={user.userId}
          />
        )}

        <Drawer
          title="Weaving"
          posts={[]}
          weaves={weaves}
          conditions={conditions}
          currentUserId={user.userId}
          highlightWeaveId={
            highlightWeaveId ? Number(highlightWeaveId) : undefined
          }
        />
        <Drawer title="Share" posts={sharePosts} conditions={conditions} />
        <Drawer title="Wish" posts={wishPosts} conditions={conditions} />
      </div>
    </>
  );
};

export default UserPage;
