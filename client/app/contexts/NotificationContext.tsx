"use client";

import React, { createContext, useContext, useEffect } from "react";
import useSWR from "swr";
import { useSocket } from "@/hooks/useSocket";
import toast from "react-hot-toast";
import { useNavbar } from "./NavBarContext";

import { useUser } from "./UserContext";

export interface NotificationItem {
  id: number;
  type: "LIKE" | "COMMENT" | "ORDER_UPDATE" | "SYSTEM";
  title: string;
  content: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

// Generic fetcher for SWR
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => res.json());

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider",
    );
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Consume Navbar context
  const { showNavbar } = useNavbar();
  // Consume User context
  const { user, loading: isUserLoading } = useUser();

  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  const userId = user?.userId || null;
  const isUserFetching = isUserLoading;

  // 2. Setup Socket
  const { socket } = useSocket();

  // 3. Use SWR for Notifications
  const {
    data,
    isLoading,
    mutate: mutateNotifications,
  } = useSWR(userId ? `${hostName}/api/notifications` : null, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount !== undefined ? data.unreadCount : 0;

  // Loading is true only if we are initial fetching user OR if SWR is initial loading (and user exists)
  // SWR's isLoading is true when there is no data and request is validating.
  // If key is null (userId null), isLoading is false.
  const loading = isUserFetching || (userId !== null && isLoading);

  // Wrapper for refresh to match context interface
  const refreshNotifications = async () => {
    await mutateNotifications();
  };

  // 4. Socket Listener
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (
      data: Omit<NotificationItem, "is_read"> & { created_at?: string },
    ) => {
      const newNotif: NotificationItem = {
        ...data,
        created_at: data.created_at || new Date().toISOString(),
        is_read: false,
      };

      // Optimistic update via SWR
      mutateNotifications(
        (
          prevData:
            | { notifications: NotificationItem[]; unreadCount: number }
            | undefined,
        ) => {
          const currentList = prevData?.notifications || [];
          const currentCount = prevData?.unreadCount || 0;

          return {
            notifications: [newNotif, ...currentList],
            unreadCount: currentCount + 1,
          };
        },
        false,
      ); // false = do not revalidate immediately

      // Auto-show navbar and toast
      showNavbar();
      toast.success(newNotif.title || "New Notification");
    };

    socket.on("new_notification", handleNewNotification);

    return () => {
      socket.off("new_notification", handleNewNotification);
    };
  }, [socket, showNavbar, mutateNotifications]);

  // 5. Actions
  const markAsRead = async (id: number) => {
    // Optimistic update
    mutateNotifications(
      (
        prevData:
          | { notifications: NotificationItem[]; unreadCount: number }
          | undefined,
      ) => {
        if (!prevData) return undefined;
        return {
          ...prevData,
          notifications: prevData.notifications.map((n: NotificationItem) =>
            n.id === id ? { ...n, is_read: true } : n,
          ),
          unreadCount: Math.max(0, (prevData.unreadCount || 0) - 1),
        };
      },
      false,
    );

    try {
      await fetch(`${hostName}/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      // Optionally revalidate here to ensure sync
      mutateNotifications();
    } catch (error) {
      console.error("Failed to mark as read", error);
      // Revert on error? For now, keep simple.
      mutateNotifications();
    }
  };

  const markAllAsRead = async () => {
    // Optimistic
    mutateNotifications(
      (
        prevData:
          | { notifications: NotificationItem[]; unreadCount: number }
          | undefined,
      ) => {
        if (!prevData) return undefined;
        return {
          ...prevData,
          notifications: prevData.notifications.map((n: NotificationItem) => ({
            ...n,
            is_read: true,
          })),
          unreadCount: 0,
        };
      },
      false,
    );

    try {
      await fetch(`${hostName}/api/notifications/read-all`, {
        method: "PUT",
        credentials: "include",
      });
      toast.success("All marked as read");
      mutateNotifications();
    } catch (error) {
      console.error("Failed to mark all read", error);
      toast.error("Failed to mark all read");
      mutateNotifications();
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
