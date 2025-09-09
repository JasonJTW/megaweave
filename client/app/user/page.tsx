"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import User from "../types/user";
import { googleLogout } from "@react-oauth/google";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  User as UserIcon,
  LogOut,
  Edit3,
  Save,
  X,
  Contact,
} from "lucide-react";

import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import Image from "next/image";

// 定義表單資料型別（無需 zod）
type ContactSettingsValues = {
  email?: string; // 可選填的電子郵件
  phone?: string; // 可選填的電話號碼
  emailVisible: boolean; // 是否公開 toggle
  phoneVisible: boolean;
};

// 初始表單值

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
const userNameMaxLength =
  Number(process.env.NEXT_PUBLIC_USERNAME_MAX_LENGTH) || 30;

const defaultContactValues: ContactSettingsValues = {
  email: "",
  phone: "",
  emailVisible: false,
  phoneVisible: false,
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
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [tempBio, setTempBio] = useState("");
  const [tempUsername, setTempUsername] = useState("");
  const router = useRouter();

  const contactForm = useForm<ContactSettingsValues>({
    defaultValues: defaultContactValues,
  });

  const onContactFormSubmit = (data: ContactSettingsValues) => {
    console.log("Contact settings updated:", data);
    // 這裡可以添加 API 調用來保存設定
  };

  const fetchUser = async () => {
    try {
      const response = await fetch(`${hostName}/api/currentUser`, {
        cache: "no-store",
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.json();
        console.error("Error fetching user data:", errorMessage.errorMessage);
        //* Handle HTTP errors
        if (response.status === 401) {
          router.push("/signin");
          setRedirecting(true);
        }

        throw new Error(` ${errorMessage.errorMessage}`);
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
      setError(null);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
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
    }

    const result = await response.json();
    console.log("get custom_name:", result.custom_name);
    setUsername(result.custom_name);
  };

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
        }
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error("Failed to update profile: ", result.errorMessage);
      }
      const result = await response.json();
      console.log("Update profile Success: ", result);
    } catch (error) {
      console.error("Error update profile: ", error);
      setError(
        error instanceof Error ? error.message : "Error update contact email"
      );
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
        }
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error("Failed to update profile: ", result.errorMessage);
      }
      const result = await response.json();
      console.log("Update profile Success: ", result);
    } catch (error) {
      console.error("Error update profile: ", error);
      setError(
        error instanceof Error ? error.message : "Error update contact phone"
      );
      throw error;
    }
  };

  const getContactEmail = async () => {
    const response = await fetch(`${hostName}/api/userprofile/contact_email`, {
      cache: "no-store",
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const result = await response.json();
      console.error("Error fetching userprofile:", result.errorMessage);
      setError(result.errMessage);
    }
    const result = await response.json();
    const emailValue = result.contactEmail || "";
    setContactEmail(emailValue);
    contactForm.setValue("email", emailValue);
  };

  const getContactPhone = async () => {
    const response = await fetch(`${hostName}/api/userprofile/contact_phone`, {
      cache: "no-store",
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      const result = await response.json();
      console.error("Error fetching userprofile:", result.errorMessage);
      setError(result.errMessage);
    }
    const result = await response.json();
    const phoneValue = result.contactPhone || "";
    setContactPhone(phoneValue);
    contactForm.setValue("phone", phoneValue);
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
      setError(null);
      setIsEditingContact(false);
    } catch (error) {
      console.error("Error saving contact info:", error);
      setError(
        error instanceof Error ? error.message : "Error saving contact info"
      );
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
      emailVisible: contactForm.getValues("emailVisible"),
      phoneVisible: contactForm.getValues("phoneVisible"),
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

  const renderTextWithUrls = (text: string) => {
    if (!text) return;
    const urlRegex =
      /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}[-a-zA-Z0-9()@:%_\+.~#?&=\/]*)/g;

    const isValidUrl = (url: string): boolean => {
      try {
        const urlObj = new URL(url);
        return urlObj.protocol === "http:" || urlObj.protocol === "https:";
      } catch {
        return false;
      }
    };

    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      if (urlRegex.test(part) && isValidUrl(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors duration-150"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  useEffect(() => {
    fetchUser();
    getBio();
    getContactEmail();
    getContactPhone();
    getUsername();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || redirecting) {
    return (
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
    );
  }

  if (error) {
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <Alert className="max-w-md bg-red-950/50 border-red-500/30">
        <AlertDescription className="text-red-300">
          Error fetching user data: {error}
        </AlertDescription>
      </Alert>
    </div>;
  }

  if (!user) {
    setRedirecting(true);
    router.push("/signin");
    return;
  }

  return (
    <>
      <div className="fixed inset-0 bg-megaweave-brown -z-10"></div>
      <div className="min-h-screen  text-secondary px-0 sm:px-6 md:px-12 lg:px-16">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-b border-megaweave-brown/50 backdrop-blur-sm bg-megaweave-brown/30"
        >
          <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-9xl font-ddin font-extrabold tracking-wide">
                User Profile
              </h1>
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

        {/*TODO Make username editable like bio */}
        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
                {/* Avatar */}
                <div className="text-center mb-2">
                  <div className="relative">
                    <div className="w-full max-w-72 h-80 max-h-80 bg-secondary/50 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2 mx-auto shadow-lg shadow-blue-500/20 hover:cursor-pointer relative">
                      {username.charAt(0)}
                      <div className="absolute -bottom-3 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-gray-800"></div>
                    </div>
                  </div>
                </div>

                {/* User Info */}
                <div className="text-center space-y-3">
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
                          className="text-2xl font-bold  "
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
                          <Edit3
                            className="w-4 style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2, // 最多顯示兩行
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word'
                          }}h-4 text-gray-400"
                          />
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

                  <p className="text-gray-400">{user.email}</p>

                  {/* Role Badge */}
                  <div className="flex justify-center ">
                    <span
                      className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border-[.5px] border-megaweave-red-light bg-megaweave-red-dark/20`}
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
                  <div className="p-3 bg-megaweave-blue-light/10 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">24</div>
                    <div className="text-xs text-gray-400">Projects</div>
                  </div>
                  <div className="p-3 bg-megaweave-blue-light/10 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">156</div>
                    <div className="text-xs text-gray-400">Commits</div>
                  </div>
                  <div className="p-3 bg-megaweave-blue-light/10 rounded-lg">
                    <div className="text-2xl font-bold text-purple-400">89</div>
                    <div className="text-xs text-gray-400">Stars</div>
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
              <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold flex items-center space-x-2">
                    <UserIcon className="w-5 h-5" />
                    <span>About Me</span>
                  </h3>
                  {!isEditingBio ? (
                    <button
                      onClick={handleEditBio}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 text-sm"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
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
                    className="text-gray-300 leading-relaxed whitespace-pre-line"
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
                      className="w-full h-32 bg-gray-700/30 border border-gray-600/30 rounded-lg px-4 py-3 text-gray-300 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
                      placeholder="Tell us about yourself..."
                    />
                  </motion.div>
                )}
              </div>

              {/* Contact Settings */}
              <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-semibold flex items-center space-x-2">
                    <Contact className="w-5 h-5" />
                    <span>Contact Setting</span>
                  </h3>
                  {!isEditingContact ? (
                    <button
                      onClick={handleEditContact}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 text-sm"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
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
                    {/* Email Section */}
                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-medium">
                            Email
                          </FormLabel>
                        </div>

                        {/* EmailVisible */}
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

                      {/* EmailInput */}
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
                                  // onChange={(e) => {
                                  // field.onChange(e); // 更新表單狀態
                                  // }}
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

                    {/* Phone Section */}
                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-medium">
                            Phone
                          </FormLabel>
                        </div>

                        {/* PhoneVisible */}
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

                      {/* PhoneInput */}
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
                                  // onChange={(e) => {
                                  // field.onChange(e); // 更新表單狀態
                                  // setTempContactPhone(e.target.value); // 同步更新臨時變量
                                  // }}
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
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
};

export default UserPage;
