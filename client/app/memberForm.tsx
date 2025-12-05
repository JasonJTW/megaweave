import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  Edit3,
  Save,
  X,
  MapPin,
  Globe,
  IdCardLanyard,
  Mail,
  Globe2,
} from "lucide-react";
import renderTextWithUrls from "@/utils/renderTextWithUrl";
import { TeamMember } from "./teamMembers";
import { useTeam } from "./contexts/TeamContext";

// Member Form 資料型別
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

interface MemberFormProps {
  isContributor: boolean;
  memberUserId: number;
}

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

const MemberForm: React.FC<MemberFormProps> = ({
  isContributor,
  memberUserId,
}) => {
  // State management
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [membername, setMembername] = useState("");
  const [tempMembername, setTempMembername] = useState("");
  const [isEditingMembername, setIsEditingMembername] = useState(false);
  const [member, setMember] = useState<TeamMember | null>(null);
  const memberNameMaxLength =
    Number(process.env.NEXT_PUBLIC_USERNAME_MAX_LENGTH) || 30;
  const { refetchTeamMembers } = useTeam();

  // Form state
  const memberForm = useForm<MemberFormValues>({
    defaultValues: defaultMemberValues,
  });

  // API functions
  const fetchMemberData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${hostName}/api/member/all?userId=${memberUserId}`,
        {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorMessage || "Failed to fetch member data");
      }

      const result = await response.json();
      const memberData = result[0];
      console.log("Fetch current Member data:", memberData);
      setMember(memberData);
      setMembername(memberData.member_name);
      setTempMembername(memberData.member_name);
      // Update form with fetched data
      memberForm.reset({
        title: memberData.title || "",
        location: memberData.location || "",
        website: memberData.websites[0].url || "",
        email: memberData.email || "",
      });

      setError(null);
    } catch (error) {
      console.error("Error fetching member data:", error);
      setError(
        error instanceof Error ? error.message : "Failed to fetch member data"
      );
    } finally {
      setLoading(false);
    }
  };

  const saveMemberData = async (data: MemberFormValues) => {
    try {
      const updates = {
        title: data.title,
        location: data.location,
        email: data.email, // 使用小寫
        websites: data.website
          ? JSON.stringify([{ url: data.website, type: "personal" }])
          : JSON.stringify([]), // 轉換為陣列格式
      };

      const response = await fetch(`${hostName}/api/member`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updates: updates,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorMessage || "Failed to save member data");
      }

      const result = await response.json();
      console.log("Member data saved successfully:", result);
      setError(null);
      return result;
    } catch (error) {
      console.error("Error saving member data:", error);
      setError(
        error instanceof Error ? error.message : "Failed to save member data"
      );
      throw error;
    }
  };

  const insertMembername = async (updates: Partial<TeamMember>) => {
    try {
      const response = await fetch(`${hostName}/api/member`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updates: updates,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(`Failed to update membername: ${result.errorMessage}`);
      }
      const result = await response.json();
      console.log("Update membername Success: ", result);
    } catch (error) {
      console.error("Error update membername: ", error);
      setError(
        error instanceof Error ? error.message : "Error update membername"
      );
      throw error;
    }
  };

  const handleSaveMembername = async () => {
    if (tempMembername == membername) {
      setIsEditingMembername(false);
      return;
    } else {
      try {
        setMembername(tempMembername);
        setIsEditingMembername(false);
        await insertMembername({ member_name: tempMembername });
        // 同时更新 user 对象中的 username
        if (member) {
          setMember({ ...member, member_name: tempMembername });
          setError(null);
        }
      } catch (error) {
        console.error("Error saving username:", error);
        // 如果保存失败，恢复原来的值
        setMembername(membername || "");
        setTempMembername(membername || "");
        setError(
          error instanceof Error ? error.message : "Error saving username"
        );
      }
    }
  };

  const handleCancelMembername = () => {
    setTempMembername(membername || member?.member_name || "");
    setIsEditingMembername(false);
  };

  const handleEditMembername = () => {
    setIsEditingMembername(true);
    setTempMembername(membername || member?.member_name || "");
  };

  // Event handlers
  const handleEditMember = () => {
    setIsEditingMember(true);
  };

  const handleSaveMember = async () => {
    try {
      const formData = memberForm.getValues();
      await saveMemberData(formData);
      await refetchTeamMembers();
      await setIsEditingMember(false);
    } catch (error) {
      // Error handling is done in saveMemberData
      console.log("Error saving member data, staying in edit mode.", error);
    }
  };

  const handleCancelMember = () => {
    // Reset form to original values
    memberForm.reset({
      title: member?.title || "",
      location: member?.location || "",
      website: member?.websites?.[0]?.url || "",
      email: member?.email || "",
    });
    setIsEditingMember(false);
    setError(null);
  };

  const onMemberFormSubmit = async () => {
    await handleSaveMember();
  };

  // Load data on component mount
  useEffect(() => {
    if (isContributor) {
      fetchMemberData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContributor]);

  // Don't render if not contributor
  if (!isContributor) {
    return null;
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto px-6 py-4"
      >
        <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6">
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-megaweave-gold/30 border-t-megaweave-red-light rounded-full animate-spin"></div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="max-w-6xl mx-auto px-6 py-4"
    >
      <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/30 rounded-2xl p-6 hover:border-gray-600/40 transition-all duration-300">
        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 bg-red-950/50 border-red-500/30">
            <AlertDescription className="text-red-300">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex justify-between mb-6">
          <h3 className="text-xl font-semibold flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Member Information</span>
          </h3>
          {!isEditingMember ? (
            <button
              onClick={handleEditMember}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 text-sm"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleSaveMember}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 transition-all duration-200 text-sm text-green-400"
              >
                <Save className="w-3 h-3" />
                <span>Save</span>
              </button>
              <button
                onClick={handleCancelMember}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-600/20 hover:bg-gray-600/30 transition-all duration-200 text-sm text-gray-400"
              >
                <X className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Avatar and name */}
          <div className="flex-row items-center mb-8 min-w-64">
            {/* Avatar */}
            <div className="text-center mb-2">
              <div className="relative">
                <div className="w-full max-w-72 h-80 max-h-80 bg-secondary/50 rounded-2xl flex items-center justify-center text-2xl font-bold mb-2 mx-auto shadow-lg shadow-blue-500/20 hover:cursor-pointer relative">
                  {membername.charAt(0)}
                  <div className="absolute -bottom-3 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-gray-800"></div>
                </div>
              </div>
            </div>

            {/* Member Name */}
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center space-x-2">
                {!isEditingMembername ? (
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
                      {membername}
                    </h2>
                    <button
                      onClick={handleEditMembername}
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
                        onClick={handleSaveMembername}
                        className="p-1 hover:bg-green-600/30 rounded text-green-400 transition-colors duration-200"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelMembername}
                        className="p-1 hover:bg-gray-600/30 rounded text-gray-400 transition-colors duration-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                    <textarea
                      value={tempMembername}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\n/g, ""); // 防止換行
                        if (value.length <= memberNameMaxLength) {
                          setTempMembername(value);
                        }
                      }}
                      maxLength={memberNameMaxLength}
                      rows={tempMembername.length > 15 ? 2 : 1}
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
                          handleSaveMembername();
                        }
                      }}
                    />
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 w-full">
            <Form {...memberForm}>
              <form
                onSubmit={memberForm.handleSubmit(onMemberFormSubmit)}
                className="space-y-6 "
              >
                {/* Title  */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Title */}
                  <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <IdCardLanyard className="w-4 h-4" />
                        <FormLabel className="text-base font-medium">
                          Title
                        </FormLabel>
                      </div>
                    </div>
                    <FormField
                      control={memberForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            {isEditingMember ? (
                              <input
                                {...field}
                                type="text"
                                placeholder="Enter your title"
                                className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                              />
                            ) : (
                              <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
                                {field.value || "No title provided"}
                              </div>
                            )}
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* Location */}
                  <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-4 h-4" />
                        <FormLabel className="text-base font-medium">
                          Location
                        </FormLabel>
                      </div>
                    </div>
                    <FormField
                      control={memberForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            {isEditingMember ? (
                              <input
                                {...field}
                                type="text"
                                placeholder="Enter your location"
                                className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                              />
                            ) : (
                              <div className="text-gray-300 rounded-lg">
                                {field.value || "No location provided"}
                              </div>
                            )}
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Social Links */}
                <div className="space-y-6">
                  <h4 className="text-lg font-medium flex items-center space-x-2">
                    <Globe className="w-4 h-4" />
                    <span>Social Links</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Email */}
                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4" />
                        <FormLabel className="text-base font-medium">
                          Email
                        </FormLabel>
                      </div>
                      <FormField
                        control={memberForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              {isEditingMember ? (
                                <input
                                  {...field}
                                  type="email"
                                  placeholder="https://Email.com/in/username"
                                  className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                                />
                              ) : (
                                <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center">
                                  {field.value || "No Email provided"}
                                </div>
                              )}
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    {/* Website */}
                    <div className="p-4 bg-megaweave-blue/10 rounded-lg space-y-4">
                      <div className="flex items-center space-x-2">
                        <Globe2 className="w-4 h-4" />
                        <FormLabel className="text-base font-medium">
                          Website
                        </FormLabel>
                      </div>
                      <FormField
                        control={memberForm.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              {isEditingMember ? (
                                <input
                                  {...field}
                                  type="url"
                                  placeholder="https://your-website.com"
                                  className="w-full rounded-lg px-4 py-2 text-gray-300 bg-gray-700/30 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 break-all"
                                />
                              ) : (
                                <div className="text-gray-300 rounded-lg min-h-[2.5rem] flex items-center break-all">
                                  {renderTextWithUrls(
                                    field.value || "No website provided"
                                  )}
                                </div>
                              )}
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MemberForm;
