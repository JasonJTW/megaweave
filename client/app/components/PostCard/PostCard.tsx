import React from "react";

import Image from "next/image";
import {
  MapPin,
  Calendar,
  User as UserIcon,
  Tag,
  Eye,
  Heart,
} from "lucide-react";
import { Post, Condition } from "../../types/schema";

interface PostCardProps {
  post: Post;
  conditions: Condition[];
  onPostClick?: (post: Post) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  conditions,
  onPostClick,
}) => {
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

  return (
    <div
      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
      onClick={() => onPostClick?.(post)}
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
        {/* 其餘內容保持不變... */}
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
    </div>
  );
};

export default PostCard;
