"use client";
import React, { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  MessageCircle,
  User as UserIcon,
  MapPin,
  Calendar,
  Eye,
  EyeOff,
} from "lucide-react";
import { Post } from "../../types/schema";
import User from "../../types/user";
import { useRouter } from "next/navigation";
import ShareButton from "../ShareButton/ShareButton";

interface ContactInfoProps {
  post: Post;
  user: User | null;
  showContactInfo: boolean;
  setShowContactInfo: (show: boolean) => void;
}

const ContactInfo: React.FC<ContactInfoProps> = ({
  post,
  user,
  showContactInfo,
  setShowContactInfo,
}) => {
  const router = useRouter();

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const setContactInfo = (post: Post) => {
    if (post.showContact) {
      setShowContactInfo(true);
    } else {
      setShowContactInfo(false);
    }
  };

  useEffect(() => {
    setContactInfo(post);
  }, [post]);

  // 檢查是否為電話號碼
  const isPhoneNumber = (contact: string) => {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(contact);
  };

  // 檢查是否為電子郵件
  const isEmail = (contact: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(contact);
  };

  // 獲取聯絡方式圖標
  const getContactIcon = (contact: string) => {
    if (isPhoneNumber(contact)) {
      return <Phone className="w-4 h-4" />;
    } else if (isEmail(contact)) {
      return <Mail className="w-4 h-4" />;
    } else {
      return <MessageCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="font-semibold text-gray-900 mb-4">發佈者資訊</h3>

      {/* 用戶基本資訊 */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{post.username}</h4>
            <p className="text-sm text-gray-500">
              加入於 {formatDate(post.created_at)}
            </p>
          </div>
        </div>

        {/* 貼文統計 */}
        <div className="flex items-center space-x-4 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <Eye className="w-4 h-4" />
            <span>{post.view_count} 次瀏覽</span>
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(post.created_at)}</span>
          </div>
        </div>

        {/* 地點資訊 */}
        {post.location && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span>{post.location}</span>
          </div>
        )}
      </div>

      {/* 聯絡方式區域 */}
      {showContactInfo && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">聯絡方式</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowContactInfo(!showContactInfo)}
              className="text-gray-500 hover:text-gray-700"
            >
              {showContactInfo ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          </div>

          {!user ? (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 mb-2">請登入以查看聯絡方式</p>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  // 這裡可以觸發登入流程
                  router.push("/signin");
                }}
              >
                登入
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {post.contact ? (
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-full">
                        {getContactIcon(post.contact)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {post.contact &&
                            isPhoneNumber(post.contact) &&
                            "電話號碼"}
                          {post.contact && isEmail(post.contact) && "電子郵件"}
                          {post.contact &&
                            !isPhoneNumber(post.contact) &&
                            !isEmail(post.contact) &&
                            "聯絡方式"}
                        </p>
                        <p className="text-gray-700 font-mono text-sm">
                          {post.contact}
                        </p>
                      </div>
                    </div>
                    <ShareButton
                      content={post.contact}
                      label="複製聯絡方式"
                      className="text-gray-500 hover:text-gray-700"
                      variant="ghost"
                      size="sm"
                      showText={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">發佈者未提供聯絡方式</p>
                </div>
              )}

              {/* 聯絡提示 */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">
                  <strong>提醒：</strong>
                  請注意個人安全，建議在公共場所進行交易，避免提供個人敏感資訊。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 快速操作按鈕 */}
      {showContactInfo && post.contact && user && (
        <div className="mt-4 space-y-2">
          {post.contact && isPhoneNumber(post.contact) && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => post.contact && window.open(`tel:${post.contact}`)}
            >
              <Phone className="w-4 h-4 mr-2" />
              撥打電話
            </Button>
          )}

          {post.contact && isEmail(post.contact) && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                post.contact && window.open(`mailto:${post.contact}`)
              }
            >
              <Mail className="w-4 h-4 mr-2" />
              發送郵件
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactInfo;
