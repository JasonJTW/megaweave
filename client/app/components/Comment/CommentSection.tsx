//* CommentSection.tsx
import React from "react";
// import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, User as UserIcon } from "lucide-react";
import { Comment } from "../../types/schema";
import User from "../../types/user";
import CommentCard from "./CommentCard";

interface CommentSectionProps {
  comments: Comment[];
  onSubmitComment: () => void;
  newComment: string;
  setNewComment: (comment: string) => void;
  isSubmittingComment: boolean;
  user: User | null;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  comments,
  onSubmitComment,
  newComment,
  setNewComment,
  isSubmittingComment,
  user,
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmitComment();
    }
  };

  return (
    <div className="">
      <CommentCard />
      {/* 評論輸入區 */}
      {user ? (
        <div className="mb-6">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="寫下你的評論..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-500">
                  按 Enter 發送，Shift+Enter 換行
                </span>
                <Button
                  onClick={onSubmitComment}
                  disabled={isSubmittingComment || !newComment.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
                >
                  {isSubmittingComment ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>發送中...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Send className="w-4 h-4" />
                      <span>發送</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg text-center">
          <p className="text-gray-600">請先登入才能留言</p>
        </div>
      )}

      {/* 評論列表 */}
      <div className="space-y-6">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>還沒有評論，成為第一個留言的人吧！</p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))
        )}
      </div>
    </div>
  );
};

// 評論項目組件
const CommentItem: React.FC<{ comment: Comment }> = ({ comment }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex items-start space-x-3">
      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
        <UserIcon className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1">
        <div className="flex items-center space-x-2 mb-1">
          <span className="font-medium text-gray-900">{comment.username}</span>
          <span className="text-xs text-gray-500">
            {formatDate(comment.created_at)}
          </span>
        </div>
        <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );
};

export default CommentSection;
