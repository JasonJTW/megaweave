"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useSocket } from "@/hooks/useSocket";
import toast from "react-hot-toast";
import { useNavbar } from "./NavBarContext";

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

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useNotification must be used within a NotificationProvider");
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<number | null>(null);

    // Consume Navbar context
    const { showNavbar } = useNavbar();

    const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

    // 1. Fetch current user to get userId for socket
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch(`${hostName}/api/currentUser`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        setUserId(data.user.userId);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch user for notifications", error);
            }
        };
        fetchUser();
    }, [hostName]);

    // 2. Setup Socket
    const { socket } = useSocket(userId ? userId.toString() : "");

    // 3. Fetch Initial Notifications & Count
    const refreshNotifications = useCallback(async () => {
        try {
            // Fetch list
            const listRes = await fetch(`${hostName}/api/notifications`, { credentials: "include" });
            if (listRes.ok) {
                const data = await listRes.json();
                setNotifications(data.notifications);
                
                if (data.unreadCount !== undefined) {
                    setUnreadCount(data.unreadCount);
                } else {
                    setUnreadCount(data.notifications.filter((n: NotificationItem) => !n.is_read).length);
                }
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setLoading(false);
        }
    }, [hostName]);

    // Initial load
    useEffect(() => {
        if (userId) {
            refreshNotifications();
        }
    }, [userId, refreshNotifications]);

    // 4. Socket Listener
    useEffect(() => {
        if (!socket) return;

        const handleNewNotification = (data: Omit<NotificationItem, 'is_read'> & { created_at?: string }) => {
            const newNotif: NotificationItem = {
                ...data,
                created_at: data.created_at || new Date().toISOString(),
                is_read: false
            };

            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            // Auto-show navbar and toast
            showNavbar();
            toast.success(newNotif.title || "New Notification");
        };

        socket.on("new_notification", handleNewNotification);

        return () => {
            socket.off("new_notification", handleNewNotification);
        };
    }, [socket, showNavbar]);

    // 5. Actions
    const markAsRead = async (id: number) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));

        try {
            await fetch(`${hostName}/api/notifications/${id}/read`, {
                method: 'PATCH',
                credentials: 'include'
            });
        } catch (error) {
            console.error("Failed to mark as read", error);
            // Revert on error? For now, keep simple.
        }
    };

    const markAllAsRead = async () => {
        // Optimistic
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);

        try {
            await fetch(`${hostName}/api/notifications/read-all`, {
                method: 'PUT',
                credentials: 'include'
            });
            toast.success("All marked as read");
        } catch (error) {
            console.error("Failed to mark all read", error);
            toast.error("Failed to mark all read");
        }
    };

    return (
        <NotificationContext.Provider value={{ 
            notifications, 
            unreadCount, 
            loading, 
            markAsRead, 
            markAllAsRead,
            refreshNotifications 
        }}>
            {children}
        </NotificationContext.Provider>
    );
};
