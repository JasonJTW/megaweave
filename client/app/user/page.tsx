"use client";

import DrawerWrapper from "@/components/DrawerWrapper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { compressImage } from "@/utils/imageProcessor";
import renderTextWithUrls from "@/utils/renderTextWithUrl";
import { googleLogout } from "@react-oauth/google";
import { motion } from "framer-motion";
import { LogOut, Save, Share, User as UserIcon, Users, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useForm, type Control, type FieldPath } from "react-hook-form";
import toast from "react-hot-toast";
import CommonShareIcon from "../components/icons/CommonShareIcon";
import ContactProfileIcon from "../components/icons/ContactProfileIcon";
import EditIcon from "../components/icons/EditIcon";
import ElfIcon from "../components/icons/ElfIcon";
import ReuseIcon from "../components/icons/ReuseIcon";
import WeavingIcon from "../components/icons/WeavingIcon";
import ShareQrModal from "../components/ShareQrModal";
import { usePost } from "../contexts/PostContext";
import { useTeam } from "../contexts/TeamContext";
import { useUser } from "../contexts/UserContext";
import {
  memberToFormValues,
  normalizeTeamMember,
  TeamMember,
} from "../teamMembers";
import { UserStats } from "../types/schema";
import User from "../types/user";
// 定義表單資料型別（無需 zod）
type ContactSettingsValues = {
  email?: string; // 可選填的電子郵件
  phone?: string; // 可選填的電話號碼
};

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
const processHostName = process.env.NEXT_PUBLIC_PROCESS_HOSTNAME;
const userNameMaxLength =
  Number(process.env.NEXT_PUBLIC_USERNAME_MAX_LENGTH) || 30;

const defaultContactValues: ContactSettingsValues = {
  email: "",
  phone: "",
};

const defaultStats: UserStats = {
  postCount: 0,
  weaveCount: 0,
  points: 0,
};

type MemberFormValues = {
  title?: string;
  location?: string;
  website?: string;
  email?: string;
};

const defaultMemberValues: MemberFormValues = {
  title: "",
  location: "",
  website: "",
  email: "",
};

type InfoFieldRowValues = MemberFormValues | ContactSettingsValues;

interface MemberInfoFieldRowProps<T extends InfoFieldRowValues> {
  label: string;
  name: FieldPath<T>;
  control: Control<T>;
  isEditing: boolean;
  placeholder: string;
  emptyText: string;
  inputType?: string;
  linkify?: boolean;
}

const MemberInfoFieldRow = <T extends InfoFieldRowValues>({
  label,
  name,
  control,
  isEditing,
  placeholder,
  emptyText,
  inputType = "text",
  linkify = false,
}: MemberInfoFieldRowProps<T>) => (
  <div className="py-3">
    <div className="flex items-center justify-between gap-4">
      <FormLabel className="font-bold leading-tight text-megaweave-forest-dark">
        {label}
      </FormLabel>
    </div>
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="mt-0.5 space-y-0">
          <FormControl>
            {isEditing ? (
              <input
                {...field}
                value={String(field.value ?? "")}
                type={inputType}
                placeholder={placeholder}
                className="w-full rounded-lg border border-primary-30 bg-white px-3 py-1.5 text-sm font-normal text-megaweave-forest-dark focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            ) : linkify && field.value ? (
              <div className="break-all text-sm font-normal text-megaweave-forest-dark underline">
                {renderTextWithUrls(String(field.value))}
              </div>
            ) : (
              <div className="text-sm font-normal text-megaweave-forest-dark">
                {String(field.value || emptyText)}
              </div>
            )}
          </FormControl>
        </FormItem>
      )}
    />
  </div>
);

const UserPage = () => {
  //* Get user data from cookie session
  const { user, loading: userLoading, mutate } = useUser();
  // const [user, setUser] = useState<User | null>(null);
  // const [loading, setLoading] = useState(true);
  const loading = userLoading;

  const [redirecting, setRedirecting] = useState(false);
  const [isContributor, setIsContributor] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [tempBio, setTempBio] = useState("");
  const [tempUsername, setTempUsername] = useState("");
  const router = useRouter();
  const { refetchTeamMembers } = useTeam();
  const { conditions } = usePost();

  // ─── /api/me — replaces 7 individual mount fetches ───────────────────────
  const meKey = user ? `${hostName}/api/me` : null;
  const {
    data: meData,
    isLoading: meLoading,
    mutate: mutateMeData,
  } = useSWR(
    meKey,
    async (url: string) => {
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch /api/me");
      const data = await res.json();
      console.log("me:", data);
      return data;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  // Derived state from /api/me
  const stats: UserStats = meData?.stats
    ? {
        postCount: meData.stats.postCount ?? 0,
        weaveCount: meData.stats.weaveCount ?? 0,
        points: meData.stats.points ?? 0,
      }
    : defaultStats;

  // Avatar preview / upload states
  const [previewSrc, setPreviewSrc] = useState<string | null>(null); // object URL for preview
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(
    null,
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isShareQrOpen, setIsShareQrOpen] = useState(false);
  const [shareProfileUrl, setShareProfileUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousPreviewRef = useRef<string | null>(null); // store previous object URL so we can revoke it

  const contactForm = useForm<ContactSettingsValues>({
    defaultValues: defaultContactValues,
  });

  const [isEditingMember, setIsEditingMember] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const memberForm = useForm<MemberFormValues>({
    defaultValues: defaultMemberValues,
  });

  const onContactFormSubmit = (data: ContactSettingsValues) => {
    console.log("Contact settings updated:", data);
    // 這裡可以添加 API 調用來保存設定
  };

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      if (user.role === "contributor" || user.role === "admin") {
        setIsContributor(true);
      }
      if (user.public_id && typeof window !== "undefined") {
        setShareProfileUrl(
          `${window.location.origin}/profile/${user.public_id}`,
        );
      }
    }
  }, [user]);

  // Sync /api/me data into local state when it arrives
  useEffect(() => {
    if (!meData) return;
    const p = meData.profile;
    if (p.custom_name) setUsername(p.custom_name);
    if (p.bio !== undefined) setBio(p.bio);
    const emailVal = p.contact_email ?? "";
    const phoneVal = p.contact_phone ?? "";
    setContactEmail(emailVal);
    setContactPhone(phoneVal);
    contactForm.setValue("email", emailVal);
    contactForm.setValue("phone", phoneVal);

    // Member data for contributors
    if (meData.member) {
      const memberData = normalizeTeamMember(meData.member);
      setMember(memberData);
      memberForm.reset(memberToFormValues(memberData));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData]);

  const fetchMemberData = async (
    memberUserId: number,
    options?: { silent?: boolean },
  ) => {
    // Used only after a save action to refresh member data
    try {
      if (!options?.silent) setMemberLoading(true);
      const response = await fetch(
        `${hostName}/api/member/all?userId=${memberUserId}`,
        {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorMessage || "Failed to fetch member data");
      }

      const result = await response.json();
      if (!result[0]) {
        throw new Error("Member profile not found");
      }
      const memberData = normalizeTeamMember(result[0]);
      setMember(memberData);
      memberForm.reset(memberToFormValues(memberData));
      setMemberError(null);
    } catch (err) {
      console.error("Error fetching member data:", err);
      setMemberError(
        err instanceof Error ? err.message : "Failed to fetch member data",
      );
    } finally {
      if (!options?.silent) setMemberLoading(false);
    }
  };

  const saveMemberData = async (data: MemberFormValues) => {
    const updates = {
      title: data.title,
      location: data.location,
      email: data.email,
      websites: data.website
        ? JSON.stringify([{ url: data.website, type: "personal" }])
        : JSON.stringify([]),
    };

    const response = await fetch(`${hostName}/api/member`, {
      cache: "no-store",
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.errorMessage || "Failed to save member data");
    }

    setMemberError(null);
  };

  const handleEditMember = () => setIsEditingMember(true);

  const handleSaveMember = async () => {
    try {
      const formData = memberForm.getValues();
      await saveMemberData(formData);

      const updatedMember: TeamMember = normalizeTeamMember({
        ...(member ?? {
          index: 0,
          user_id: user!.userId,
          member_name: username,
          avatar_url: user?.avatar_url ?? "",
          avatar_key: user?.avatar_key ?? "",
          user_role: user?.role ?? "contributor",
          sort_order: 0,
        }),
        title: formData.title,
        location: formData.location,
        email: formData.email,
        websites: formData.website
          ? [{ url: formData.website, type: "personal" }]
          : [],
      });

      setMember(updatedMember);
      memberForm.reset(memberToFormValues(updatedMember));
      setIsEditingMember(false);
      setMemberError(null);
      toast.success("Team member info saved");

      await refetchTeamMembers();
      if (user?.userId) {
        await fetchMemberData(user.userId, { silent: true });
      }
    } catch (err) {
      console.error("Error saving member data:", err);
      setMemberError(
        err instanceof Error ? err.message : "Failed to save member data",
      );
      toast.error(
        err instanceof Error ? err.message : "Failed to save member data",
      );
    }
  };

  const handleCancelMember = () => {
    if (member) {
      memberForm.reset(memberToFormValues(member));
    }
    setIsEditingMember(false);
    setMemberError(null);
  };

  // After saving member, do a silent refresh via the original endpoint
  // (avoids re-fetching the entire /api/me payload)

  // NOTE: getBio, getUsername, fetchStats, fetchUserPosts, fetchWeaves have been
  // removed — their data now arrives via useSWR /api/me above.
  // The POST/PUT helpers (insertBio, insertUsername, etc.) remain unchanged below.

  // --- Avatar: 使用者先預覽，確認後才上傳 ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;

    // validation (example: limit 5MB)
    const maxSizeMB = 5;
    if (file.size / 1024 / 1024 > maxSizeMB) {
      toast.error(`Selected file is larger than ${maxSizeMB} MB`);
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
        toast.error(result.errorMessage || "Failed to update user session");
        throw new Error(result.errorMessage || "Failed to update user session");
      }
      const result = await response.json();
      const updatedUser = result.updatedUser;
      // alert(`User session updated: ${JSON.stringify(updatedUser)}`);
      await mutate(
        (data: { user: User | null } | undefined) =>
          data ? { ...data, user: updatedUser } : { user: updatedUser },
        false,
      );
    } catch (error) {
      console.error("Error updating user session:", error);
    }
  };

  const uploadAvatar = async () => {
    if (!selectedAvatarFile) return;

    setUploadingAvatar(true);

    try {
      // 1. Compress before processing to save bandwidth to the effect service
      const compressedBlob = await compressImage(
        selectedAvatarFile,
        800,
        800,
        0.85,
      );
      const blobToProcess = compressedBlob || selectedAvatarFile;

      // 2. Add effects/filters via the processing host
      const effectFormData = new FormData();
      effectFormData.append("image", blobToProcess, "avatar.webp");

      const processedResponse = await fetch(`${processHostName}`, {
        method: "POST",
        credentials: "include",
        body: effectFormData,
      });

      if (!processedResponse.ok) {
        throw new Error(
          `Avatar effect processing failed: ${processedResponse.status}`,
        );
      }

      const processedBlob: Blob = await processedResponse.blob();

      // 3. Final upload to our backend
      const uploadFormData = new FormData();
      uploadFormData.append("avatar", processedBlob, "avatar.webp");

      const response = await fetch(`${hostName}/api/avatar`, {
        method: "POST",
        credentials: "include",
        body: uploadFormData,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorMessage || "Failed to upload avatar");
      }

      const result = await response.json();
      console.log("Avatar uploaded successfully:", result);

      // 更新本地 user 狀態 (顯示新的頭像)
      await mutate((data: { user: User | null } | undefined) => {
        if (!data?.user) return data;
        return {
          ...data,
          user: {
            ...data.user,
            avatar_url: result.avatarUrl,
            avatar_key: result.avatarKey,
          },
        };
      }, false);

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
      toast.error(error instanceof Error ? error.message : "Upload failed");
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
      toast.error(
        error instanceof Error ? error.message : "Error update username",
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
      toast.error(
        error instanceof Error ? error.message : "Error update profile",
      );
      throw error;
    }
  };

  const insertContactEmail = async (contactEmail: string) => {
    try {
      const response = await fetch(
        `${hostName}/api/userprofile/contact_email`,
        {
          cache: "no-store",
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contact_email: contactEmail,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error("Failed to update profile: ", result.errorMessage);
      }
      const result = await response.json();
      console.log("Update profile Success: ", result);
    } catch (error) {
      console.error("Error update profile: ", error);
      const errMsg =
        error instanceof Error ? error.message : "Error update contact email";
      toast.error(errMsg);
      throw error;
    }
  };

  const insertContactPhone = async (contactPhone: string) => {
    try {
      const response = await fetch(
        `${hostName}/api/userprofile/contact_phone`,
        {
          cache: "no-store",
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contact_phone: contactPhone,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error("Failed to update profile: ", result.errorMessage);
      }
      const result = await response.json();
      console.log("Update profile Success: ", result);
    } catch (error) {
      console.error("Error update profile: ", error);
      const errMsg =
        error instanceof Error ? error.message : "Error update contact phone";
      toast.error(errMsg);
      throw error;
    }
  };

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

  const handleSaveContact = async () => {
    const formData = contactForm.getValues();
    console.log("Contact form data:", formData);

    try {
      if (formData.email !== contactEmail) {
        await insertContactEmail(formData.email || "");
      }
      if (formData.phone !== contactPhone) {
        await insertContactPhone(formData.phone || "");
      }
      setContactEmail(formData.email || "");
      setContactPhone(formData.phone || "");
      setIsEditingContact(false);
    } catch (error) {
      console.error("Error saving contact info:", error);
      const errMsg =
        error instanceof Error ? error.message : "Error saving contact info";
      toast.error(errMsg);
    }
  };

  const handleCancelContact = () => {
    contactForm.setValue("email", contactEmail);
    contactForm.setValue("phone", contactPhone);
    setIsEditingContact(false);
  };

  const handleEditContact = () => {
    contactForm.reset({
      email: contactEmail,
      phone: contactPhone,
    });
    setIsEditingContact(true);
  };

  const handleSaveUsername = async () => {
    try {
      setUsername(tempUsername);
      setIsEditingUsername(false);
      await insertUsername(tempUsername);
      // 同时更新 user 对象中的 username
      if (user) {
        await mutate((data: { user: User | null } | undefined) => {
          if (!data?.user) return data;
          return { ...data, user: { ...data.user, username: tempUsername } };
        }, false);
      }
    } catch (error) {
      console.error("Error saving username:", error);
      // 如果保存失败，恢复原来的值
      setUsername(username || "");
      setTempUsername(username || "");
      toast.error(
        error instanceof Error ? error.message : "Error saving username",
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
      await mutate((data: { user: User | null } | undefined) => {
        if (!data?.user) return data;
        return { ...data, user: { ...data.user, avatar_url: undefined } };
      }, false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Failed to remove avatar",
      );
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
          toast.error("You are not signed in");
          return;
        }

        const errorMessage = await response.json();
        console.error("Error signing out:", errorMessage.errorMessage);
        throw new Error(` ${errorMessage.errorMessage}`);
      }

      console.log("Sign out successful");
      await mutate({ user: null }, false);
      setRedirecting(true);
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    }
  };

  useEffect(() => {
    if (loading) return;

    // Check if user is authenticated
    if (!user) {
      // Only redirect if not already redirecting to avoid loops
      if (!redirecting) {
        setRedirecting(true);
        router.push(
          `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
        );
      }
      return;
    }

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
  }, [user, loading, redirecting, router]);

  // useEffect(() => {
  //   console.log("Fetched UserId: ", user?.userId);
  // }, [user?.userId]);

  if (loading || meLoading || redirecting) {
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

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-primary-5"></div>
      <div className="min-h-screen overflow-x-hidden px-0 sm:px-6 md:px-12 lg:px-16">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className=" "
        >
          <div className="mx-auto mt-10 flex max-w-6xl items-center justify-center px-6 py-4 md:justify-between">
            <div className="flex items-center justify-center space-x-3 md:justify-start">
              {/*icons*/}
              <div className="flex items-center space-x-2 px-6">
                <ReuseIcon className="h-[85px] w-auto text-megaweave-gold" />
                <WeavingIcon className="h-[85px] w-auto text-megaweave-forest" />
                <ElfIcon className="h-[85px] w-auto text-megaweave-red-dark" />
                <CommonShareIcon className="h-[85px] w-auto text-megaweave-blue" />
              </div>
              <span className="type-h1 hidden font-bold text-megaweave-forest-dark md:inline">
                Profile
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="hidden items-center space-x-2 rounded-full px-4 py-2 font-ddin font-bold text-megaweave-forest-dark transition-all duration-200 hover:border-primary-30 hover:bg-primary-30/35 md:flex"
            >
              <span>Sign Out</span>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </motion.header>
        {/* Main Content */}
        <div className="mx-auto max-w-6xl px-6 py-5 font-ddin">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[330px_1fr] lg:items-stretch">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="relative h-full w-full lg:w-[330px]"
            >
              <div className="relative h-full rounded-[30px] border border-primary-30 bg-white p-6 transition-all duration-300 hover:border-gray-600/40">
                <button
                  type="button"
                  onClick={() => setIsShareQrOpen(true)}
                  className="absolute right-6 top-6 z-10 rounded-full p-1.5 transition-colors hover:bg-primary-15"
                  aria-label="Share profile QR code"
                >
                  <Share className="pointer-events-none h-4 w-4 text-megaweave-forest-dark" />
                </button>
                {/* Avatar */}
                <div className="text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="relative">
                    {/* 固定尺寸容器：保持原本的大小/比例（max-w-72, h-80） */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="relative mx-auto mb-2 flex h-[222px] max-h-80 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-2xl bg-secondary/50 text-2xl font-bold hover:cursor-pointer"
                    >
                      {/* 如果有 preview，顯示 preview 圖片；否則若 user.avatarUrl 存在則顯示真實頭像，否則顯示字母色塊 */}

                      {previewSrc ? (
                        // preview: 使用原生 img 以支援 object URL
                        <Image
                          src={previewSrc}
                          alt="Avatar preview"
                          width={220}
                          height={222}
                          className="h-full w-full object-cover"
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
                            loading="eager"
                          />
                        </div>
                      ) : (
                        // fallback 色塊顯示使用者首字母
                        <div className="flex h-full w-full items-center justify-center text-4xl">
                          {username ? username.charAt(0) : "?"}
                        </div>
                      )}

                      {/* 如果是正在上傳，顯示 loading overlay */}
                      {uploadingAvatar && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"></div>
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
                        className="rounded-lg bg-red-600/10 px-3 py-1.5 text-sm text-red-300 transition-all duration-200 hover:bg-red-600/20"
                      >
                        Remove
                      </button>
                    )}
                    {/* 如果有 preview，顯示 Save / Cancel 按鈕 */}
                    {previewSrc && !uploadingAvatar && (
                      <div className="flex space-x-2">
                        <button
                          onClick={uploadAvatar}
                          className="flex items-center rounded-lg px-3 py-1 text-sm font-semibold text-primary"
                        >
                          <Save className="mr-1 h-4 w-4" />
                          <span>Upload</span>
                        </button>
                        <button
                          onClick={handleCancelAvatarPreview}
                          className="flex items-center rounded-lg px-3 py-1 text-sm font-semibold text-primary"
                        >
                          <X className="h-4 w-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
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
                        className="group relative flex items-center px-2"
                      >
                        <h2
                          className="type-h5 text-[#222]"
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
                          className="absolute left-full top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity duration-200 hover:bg-gray-600/30 group-hover:opacity-100"
                        >
                          <EditIcon className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="edit"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex w-full flex-col items-center"
                      >
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1, duration: 0.2 }}
                          className="mb-1 flex w-full justify-end space-x-2"
                        >
                          <button
                            onClick={handleSaveUsername}
                            className="rounded p-1 text-green-400 transition-colors duration-200 hover:bg-green-600/30"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleCancelUsername}
                            className="rounded p-1 text-gray-400 transition-colors duration-200 hover:bg-gray-600/30"
                          >
                            <X className="h-4 w-4" />
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
                          className="w-full resize-none overflow-hidden rounded border border-gray-600/30 bg-gray-700/30 px-2 py-1 text-center text-xl font-bold transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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

                  <p className="type-body-t5 text-gray-400">{user.email}</p>

                  {/* <UserPageDecoLine className="pt-[18px] pb-[20px]" /> */}

                  {/* Role Badge */}
                  <div className="mt-4 flex justify-center">
                    <span
                      className={`inline-flex items-center rounded-full border-[.5px] border-megaweave-red-light bg-megaweave-red-dark/40 px-4 py-2 text-sm font-medium text-white`}
                    >
                      {user.role}
                    </span>
                  </div>

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
                          unoptimized
                        />
                        <p className="text-md font-ddin font-bold tracking-widest text-megaweave-blue-light">
                          Welcome, dear contributor!
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
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

            {/* Bio & Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="min-w-0 space-y-6 lg:flex lg:h-full lg:flex-col"
            >
              {/* Bio Section */}
              <div className="min-h-[240px] flex-shrink-0 rounded-2xl border border-primary-30 bg-white p-6 transition-all duration-300 hover:border-gray-600/40">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center space-x-2 text-xl font-semibold">
                    <UserIcon className="h-5 w-5 text-megaweave-forest-dark" />
                    <div className="type-h4 text-megaweave-forest-dark">
                      About Me
                    </div>
                  </h3>
                  {!isEditingBio ? (
                    <button
                      onClick={handleEditBio}
                      className="flex items-center px-3 py-1.5 transition-all duration-200"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSaveBio}
                        className="flex items-center space-x-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-sm text-green-400 transition-all duration-200 hover:bg-green-600/30"
                      >
                        <Save className="h-3 w-3" />
                        <span>Save</span>
                      </button>
                      <button
                        onClick={handleCancelBio}
                        className="flex items-center space-x-1 rounded-lg bg-gray-600/20 px-3 py-1.5 text-sm text-gray-400 transition-all duration-200 hover:bg-gray-600/30"
                      >
                        <X className="h-3 w-3" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}
                </div>

                {!isEditingBio ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-body-t3 min-h-[140px] whitespace-pre-line break-all leading-relaxed text-primary"
                  >
                    {bio ? renderTextWithUrls(bio) : "description..."}
                  </motion.p>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <textarea
                      value={tempBio}
                      onChange={(e) => setTempBio(e.target.value)}
                      className="type-body-t3 h-32 w-full resize-none rounded-lg border border-gray-600/30 px-4 py-3 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="description"
                    />
                  </motion.div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center space-x-3"></div>
                  <button className="type-button-b2 flex items-center space-x-2 text-primary-75">
                    <span>
                      Joined in{" "}
                      {user?.joined_at
                        ? new Date(user.joined_at)
                            .toISOString()
                            .slice(0, 7)
                            .replace("-", ".")
                        : ""}
                    </span>
                  </button>
                </div>
              </div>

              {/* Contact Settings */}
              <div className="rounded-2xl border border-primary-30 bg-white p-6 transition-all duration-300 lg:flex lg:flex-1 lg:flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="type-button-b1 flex items-center space-x-2 text-megaweave-forest-dark">
                    <ContactProfileIcon className="h-5 w-5" />
                    <span>Contact Setting</span>
                  </h3>
                  {!isEditingContact ? (
                    <button
                      type="button"
                      onClick={handleEditContact}
                      className="flex items-center px-3 py-1.5 transition-all duration-200"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={handleSaveContact}
                        className="flex items-center space-x-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-sm text-green-400 transition-all duration-200 hover:bg-green-600/30"
                      >
                        <Save className="h-3 w-3" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelContact}
                        className="flex items-center space-x-1 rounded-lg bg-gray-600/20 px-3 py-1.5 text-sm text-gray-400 transition-all duration-200 hover:bg-gray-600/30"
                      >
                        <X className="h-3 w-3" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}
                </div>

                <Form {...contactForm}>
                  <form
                    onSubmit={contactForm.handleSubmit(onContactFormSubmit)}
                    className="divide-y divide-primary-30 overflow-hidden rounded-lg lg:flex lg:flex-1 lg:flex-col"
                  >
                    <MemberInfoFieldRow
                      label="Email"
                      name="email"
                      control={contactForm.control}
                      isEditing={isEditingContact}
                      placeholder="Enter your email"
                      emptyText="No email provided"
                      inputType="email"
                    />
                    <MemberInfoFieldRow
                      label="Phone"
                      name="phone"
                      control={contactForm.control}
                      isEditing={isEditingContact}
                      placeholder="Enter your contact phone number"
                      emptyText="No phone provided"
                      inputType="tel"
                    />
                  </form>
                </Form>
              </div>
            </motion.div>
          </div>

          {isContributor && user && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8"
            >
              <div className="rounded-2xl border border-primary-30 bg-primary-15 p-6 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="type-button-b1 flex items-center space-x-2 text-megaweave-forest-dark">
                    <Users className="h-5 w-5" />
                    <span>Team Member Info.</span>
                  </h3>
                  {!isEditingMember ? (
                    <button
                      onClick={handleEditMember}
                      className="flex items-center px-3 py-1.5 transition-all duration-200"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={handleSaveMember}
                        className="flex items-center space-x-1 rounded-lg bg-green-600/20 px-3 py-1.5 text-sm text-green-400 transition-all duration-200 hover:bg-green-600/30"
                      >
                        <Save className="h-3 w-3" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelMember}
                        className="flex items-center space-x-1 rounded-lg bg-gray-600/20 px-3 py-1.5 text-sm text-gray-400 transition-all duration-200 hover:bg-gray-600/30"
                      >
                        <X className="h-3 w-3" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  )}
                </div>
                <p className="type-body-t5 mb-4 mt-1 text-megaweave-forest-dark">
                  *megaweaveing Team Only
                </p>

                {memberLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-megaweave-gold/30 border-t-megaweave-red-light" />
                  </div>
                ) : (
                  <>
                    {memberError && (
                      <Alert className="mb-4 border-red-500/30 bg-red-950/50">
                        <AlertDescription className="text-red-300">
                          {memberError}
                        </AlertDescription>
                      </Alert>
                    )}
                    <Form {...memberForm}>
                      <form className="divide-y divide-primary-30 overflow-hidden rounded-lg">
                        <MemberInfoFieldRow
                          label="Title"
                          name="title"
                          control={memberForm.control}
                          isEditing={isEditingMember}
                          placeholder="Enter your title"
                          emptyText="No title provided"
                        />
                        <MemberInfoFieldRow
                          label="Location"
                          name="location"
                          control={memberForm.control}
                          isEditing={isEditingMember}
                          placeholder="Enter your location"
                          emptyText="No location provided"
                        />
                        <MemberInfoFieldRow
                          label="Website"
                          name="website"
                          control={memberForm.control}
                          isEditing={isEditingMember}
                          placeholder="https://your-website.com"
                          emptyText="No website provided"
                          inputType="url"
                          linkify
                        />
                        <MemberInfoFieldRow
                          label="Email"
                          name="email"
                          control={memberForm.control}
                          isEditing={isEditingMember}
                          placeholder="Enter your email"
                          emptyText="No email provided"
                          inputType="email"
                        />
                      </form>
                    </Form>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
        <div className="mx-auto max-w-6xl">
          <DrawerWrapper
            weaves={meData?.weaves ?? []}
            conditions={conditions}
            currentUserId={user.userId}
            fetchWeaves={mutateMeData}
            userPosts={meData?.posts ?? []}
          />
        </div>
      </div>

      <ShareQrModal
        open={isShareQrOpen}
        onOpenChange={setIsShareQrOpen}
        username={username}
        profileUrl={shareProfileUrl}
        avatarUrl={user.avatar_url}
      />
    </>
  );
};

export default UserPage;
