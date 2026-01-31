import useSWR, { useSWRConfig } from "swr";
import { useEffect } from "react";
import { useSocket } from "./useSocket";
import { Conversation, Message } from "@/app/types/schema";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
// Fetcher function
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const error = new Error("An error occurred while fetching the data.");
    throw error;
  }
  return res.json();
};



export const useConversations = () => {
  const { data: userData } = useSWR(`${hostName}/api/currentUser`, fetcher);
  const userId = userData?.user?.userId;
  
  const { data, error, isLoading, mutate } = useSWR<{ conversations: Conversation[] }>(
    userId ? `${hostName}/api/messages/conversations` : null,
    fetcher
  );

  return {
    conversations: data?.conversations || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useMessages = (conversationId: string | number | null) => {
  const { data, error, isLoading, mutate } = useSWR<{ messages: Message[], hasMore: boolean, conversation?: Conversation }>(
    conversationId ? `${hostName}/api/messages/conversations/${conversationId}` : null,
    fetcher
  );

  return {
    messages: data?.messages || [],
    conversation: data?.conversation,
    hasMore: data?.hasMore,
    isLoading,
    isError: error,
    mutate,
  };
};

export const useChatSocket = (conversationId: string | number | null) => {
    const { data: userData } = useSWR(`${hostName}/api/currentUser`, fetcher);
    const userId = userData?.user?.userId;
    const { socket } = useSocket(userId);
    const { mutate: mutateMessages } = useSWRConfig();
    const { mutate: mutateConversations } = useSWRConfig(); // Global mutate to update conversation list

    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (newMessage: Message) => {
            console.log("📨 New Message Recieved:", newMessage);

            // 1. Update Messages list if we are in that conversation
            if (conversationId && Number(conversationId) === newMessage.conversation_id) {
                mutateMessages(
                    `${hostName}/api/messages/conversations/${conversationId}`,
                    (currentData: { messages: Message[], hasMore: boolean } | undefined) => {
                        if (!currentData) return { messages: [newMessage], hasMore: false };
                        return {
                            ...currentData,
                            messages: [newMessage, ...currentData.messages] // Assume newest first
                        };
                    },
                    false // Do not revalidate immediately
                );
                
                // Mark read immediately if window is open?
                // Probably better to let the UI trigger markRead
            }

            // 2. Update Conversation List (last message & unread count)
            mutateConversations(
                `${hostName}/api/messages/conversations`,
                (currentData: { conversations: Conversation[] } | undefined) => {
                   if (!currentData) return undefined; // Let revalidate handle it
                   const conversations = currentData.conversations as Conversation[];
                   
                   const existingIndex = conversations.findIndex(c => c.id === newMessage.conversation_id);
                   
                   if (existingIndex !== -1) {
                        // Move to top and update
                        const updatedConv = {
                            ...conversations[existingIndex],
                            last_message_content: newMessage.content,
                            last_message_at: newMessage.created_at,
                            unread_count: (conversations[existingIndex].unread_count || 0) + (newMessage.sender_id !== Number(userId) ? 1 : 0)
                        };
                        
                        const newConversations = [
                            updatedConv,
                            ...conversations.filter((_, i) => i !== existingIndex)
                        ];
                        
                        return { conversations: newConversations };
                   } else {
                       // New conversation? We might need to revalidate to get full details (user info etc)
                       // Return undefined to trigger revalidation
                       return undefined;
                   }
                },
                true // Revalidate to ensure consistency or if new conversation
            );
        };

        socket.on("new_message", handleNewMessage);

        return () => {
            socket.off("new_message", handleNewMessage);
        };
    }, [socket, conversationId, mutateMessages, mutateConversations, userId]);
};
