import useSWR, { useSWRConfig } from "swr";
import { useEffect } from "react";
import { useSocket } from "./useSocket";
import { Conversation, Message } from "@/app/types/schema";
import { useUser } from "@/app/contexts/UserContext";

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
  const { user } = useUser();
  const userId = user?.userId;
  
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

export const useMessages = (conversationId: number | null) => {
  const { data, error, isLoading, mutate } = useSWR<{ messages: Message[], hasMore: boolean, conversation?: Conversation }>(
    conversationId ? `${hostName}/api/messages/conversations/${conversationId}` : null,
    fetcher
  );

  const fetchMore = async () => {
    if (!data?.hasMore || data.messages.length === 0 || !conversationId) return;

    // The messages are sorted newest first. The last message is the oldest one.
    const lastMessageId = data.messages[data.messages.length - 1].id;
    
    try {
      const res = await fetch(`${hostName}/api/messages/conversations/${conversationId}?before_id=${lastMessageId}`, {
          credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch more messages");
      
      const newData = await res.json();
      
      // Update the SWR cache by appending new messages to the end
      mutate((current) => {
          if (!current) return current;
          return {
              ...current,
              messages: [...current.messages, ...newData.messages],
              hasMore: newData.hasMore
          };
      }, false);
    } catch (err) {
      console.error("fetchMore error:", err);
    }
  };

  return {
    messages: data?.messages || [],
    conversation: data?.conversation,
    hasMore: data?.hasMore,
    isLoading,
    isError: error,
    mutate,
    fetchMore,
  };
};

export const useChatSocket = (conversationId: number | null) => {
    const { user } = useUser();
    const { socket } = useSocket();
    const { mutate: mutateMessages } = useSWRConfig();
    const { mutate: mutateConversations } = useSWRConfig(); // Global mutate to update conversation list

    useEffect(() => {
        if (!socket) {
            return;
        }

        const handleNewMessage = (newMessage: Message) => {

            const isCurrentConversationInHook = conversationId && Number(conversationId) === newMessage.conversation_id;

            // 1. Update Messages list (Local Update)
            // ONLY execute this if this hook instance is for the current conversation
            if (isCurrentConversationInHook) {
                mutateMessages(
                    `${hostName}/api/messages/conversations/${conversationId}`,
                    (currentData: { messages: Message[], hasMore: boolean } | undefined) => {
                        if (!currentData) return { messages: [newMessage], hasMore: false };
                        
                        // 1. Check for duplicates by ID
                        const isDuplicate = currentData.messages.some(m => m.id === newMessage.id);
                        if (isDuplicate) {
                            return currentData;
                        }

                        // 2. Check for optimistic message to replace (ID starts with 'temp-')
                        const tempIndex = currentData.messages.findIndex(m => 
                            String(m.id).startsWith("temp-") && 
                            m.content === newMessage.content && 
                            m.sender_public_id === newMessage.sender_public_id
                        );

                        if (tempIndex !== -1) {
                            const newMessages = [...currentData.messages];
                            newMessages[tempIndex] = newMessage;
                            return { ...currentData, messages: newMessages };
                        }

                        // 3. Otherwise, append
                        return {
                            ...currentData,
                            messages: [newMessage, ...currentData.messages]
                        };
                    },
                    false
                );
            }

            // 2. Update Conversation List (Global Update)
            // ONLY execute this in the Global Listener (where conversationId is null)
            // This prevents double updates (+2) when multiple hooks are mounted.
            if (conversationId === null) {
                mutateConversations(
                    `${hostName}/api/messages/conversations`,
                    (currentData: { conversations: Conversation[] } | undefined) => {
                        if (!currentData) {
                            return undefined; 
                        }
                        
                        const conversations = currentData.conversations;
                        const existingIndex = conversations.findIndex(c => Number(c.id) === Number(newMessage.conversation_id));
                        
                        if (existingIndex !== -1) {
                            const path = window.location.pathname;
                            const pathParts = path.split('/');
                            const activeConversationId = (pathParts[1] === 'messages' && pathParts[2]) ? Number(pathParts[2]) : null;
                            
                            const isBeingViewed = activeConversationId === Number(newMessage.conversation_id);
                            const isFocused = document.hasFocus();
                            
                           

                            let shouldIncrement = false;
                            const isMyOwnMessage = newMessage.sender_public_id === user?.public_id;

                            if (!isMyOwnMessage) {
                                if (isBeingViewed && isFocused) {
                                    shouldIncrement = false;
                                    fetch(`${hostName}/api/messages/conversations/${newMessage.conversation_id}/read`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "include",
                                    }).catch(err => console.error("Failed to mark read on global update", err));
                                } else {
                                    shouldIncrement = true;
                                }
                            }

                            const updatedConv = {
                                ...conversations[existingIndex],
                                last_message_content: newMessage.content,
                                last_message_at: newMessage.created_at,
                                unread_count: (conversations[existingIndex].unread_count || 0) + (shouldIncrement ? 1 : 0)
                            };
                            
                            const newConversations = [
                                updatedConv,
                                ...conversations.filter(c => Number(c.id) !== Number(newMessage.conversation_id))
                            ];
                            
                            return { conversations: newConversations };
                        } else {
                            return undefined; 
                        }
                    },
                    false
                );
            }
        };
        const handleMessagesRead = (data: { conversation_id: number, reader_public_id: string }) => {
            
            // 1. Update Messages list if we are in that conversation
            if (conversationId && Number(conversationId) === data.conversation_id) {
                mutateMessages(
                    `${hostName}/api/messages/conversations/${conversationId}`,
                    (currentData: { messages: Message[], hasMore: boolean } | undefined) => {
                        if (!currentData) return currentData;
                        return {
                            ...currentData,
                            messages: currentData.messages.map(m => {
                                // If I am the sender of a message, and someone else (data.reader_id) read it
                                // then I should mark MY message as read in my UI.
                                if (m.sender_public_id === user?.public_id && data.reader_public_id !== user?.public_id) {
                                    return { ...m, is_read: true };
                                }
                                // Also handle receiving my own read status from other device
                                if (m.sender_public_id !== user?.public_id && data.reader_public_id === user?.public_id) {
                                    return { ...m, is_read: true };
                                }
                                return m;
                            })
                        };
                    },
                    false
                );
            }

            if (conversationId === null) {
                // Determine if WE are the ones who read it (either on this device or another)
                const iReadIt = data.reader_public_id === user?.public_id;

                if (iReadIt) {
                    mutateConversations(
                        `${hostName}/api/messages/conversations`,
                        (currentData: { conversations: Conversation[] } | undefined) => {
                            if (!currentData) return currentData;
                            const conversations = currentData.conversations;
                            const existingIndex = conversations.findIndex(c => Number(c.id) === Number(data.conversation_id));
                            if (existingIndex !== -1) {
                                const newConversations = [...conversations];
                                newConversations[existingIndex] = {
                                    ...newConversations[existingIndex],
                                    unread_count: 0
                                };
                                return { conversations: newConversations };
                            }
                            return currentData;
                        },
                        false
                    );
                }
            }
        };

        socket.on("new_message", handleNewMessage);
        socket.on("messages_read", handleMessagesRead);

        return () => {
            socket.off("new_message", handleNewMessage);
            socket.off("messages_read", handleMessagesRead);
        };
    }, [socket, conversationId, mutateMessages, mutateConversations, user?.public_id]);

    // 2. Focus/Visibility listener: Clear unread count IMMEDIATELY when recipient focuses back to chat
    useEffect(() => {
        if (!conversationId) return;

        const clearRead = () => {
            if (!document.hasFocus()) return;

            // 1. Mark as read on server (this will emit messages_read to the sender)
            fetch(`${hostName}/api/messages/conversations/${conversationId}/read`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            }).catch(err => console.error("Failed to mark read on focus", err));

            // 2. Clear locally for THIS conversation in the global list
            mutateConversations(
                `${hostName}/api/messages/conversations`,
                (currentData: { conversations: Conversation[] } | undefined) => {
                    if (!currentData) return undefined;
                    const conversations = currentData.conversations;
                    const existingIndex = conversations.findIndex(c => c.id === Number(conversationId));
                    if (existingIndex !== -1 && (conversations[existingIndex].unread_count || 0) > 0) {
                        const newConversations = [...conversations];
                        newConversations[existingIndex] = {
                            ...newConversations[existingIndex],
                            unread_count: 0
                        };
                        return { conversations: newConversations };
                    }
                    return currentData;
                },
                false
            );
        };

        // Run if already focused when mounting
        if (document.hasFocus()) clearRead();

        window.addEventListener("focus", clearRead);
        window.addEventListener("visibilitychange", clearRead);

        return () => {
            window.removeEventListener("focus", clearRead);
            window.removeEventListener("visibilitychange", clearRead);
        };
    }, [conversationId, mutateConversations, user?.public_id]);
};
