import React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useConversations } from "@/hooks/useChat";

interface ConversationListProps {
  currentConversationId?: number;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  currentConversationId,
}) => {
  const { conversations, isLoading } = useConversations();

  if (isLoading) {
    return <div className="p-4 text-center">Loading conversations...</div>;
  }

  if (conversations.length === 0) {
    return (
        <div className="p-4 text-center text-gray-500">
            No conversations yet.
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">Messages</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={`/messages/${conversation.id}`}
            className={cn(
              "flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors border-b last:border-0",
              currentConversationId === conversation.id && "bg-blue-50 hover:bg-blue-50"
            )}
          >
            <Avatar className="w-12 h-12">
              <AvatarImage src={conversation.other_avatar_url} />
              <AvatarFallback>
                {conversation.other_username?.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold truncate">
                  {conversation.other_username}
                </span>
                {conversation.last_message_at && (
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <p className={cn(
                    "text-sm truncate pr-2",
                    conversation.unread_count > 0 ? "font-bold text-black" : "text-gray-500"
                )}>
                  {conversation.last_message_content || (conversation.last_message_attachment_count && conversation.last_message_attachment_count > 0 ? "[Image]" : "Start a conversation")}
                </p>
                {conversation.unread_count > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-500 rounded-full shrink-0">
                    {conversation.unread_count}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
