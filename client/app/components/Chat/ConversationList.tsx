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
      <div className="p-4 text-center text-gray-500">No conversations yet.</div>
    );
  }

  return (
    <div className="flex h-full flex-col border-r bg-white">
      <div className="border-b p-4">
        <h2 className="text-xl font-bold">Messages</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={`/messages/${conversation.id}`}
            className={cn(
              "flex items-center gap-3 border-b p-4 transition-colors last:border-0 hover:bg-gray-50",
              currentConversationId === conversation.id &&
                "bg-blue-50 hover:bg-blue-50",
            )}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={conversation.other_avatar_url} />
              <AvatarFallback>
                {conversation.other_username?.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="truncate font-semibold">
                  {conversation.other_username}
                </span>
                {conversation.last_message_at && (
                  <span className="ml-2 whitespace-nowrap text-xs text-gray-500">
                    {formatDistanceToNow(
                      new Date(conversation.last_message_at),
                      { addSuffix: true },
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p
                  className={cn(
                    "truncate pr-2 text-sm",
                    conversation.unread_count > 0
                      ? "font-bold text-black"
                      : "text-gray-500",
                  )}
                >
                  {conversation.last_message_content ||
                    (conversation.last_message_attachment_count &&
                    conversation.last_message_attachment_count > 0
                      ? "[Image]"
                      : "Start a conversation")}
                </p>
                {conversation.unread_count > 0 && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
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
