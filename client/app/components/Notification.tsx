"use client";
import { useSocket } from "@/hooks/useSocket";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MessageIcon from "./icons/MessageIcon";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface NotificationItem {
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

export default function NotificationList({ userId }: { userId: number }) {
  const { socket, isConnected } = useSocket(userId.toString());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  // Fetch initial notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch(`${hostName}/api/notifications`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications);
        }
      } catch (error) {
        console.error("Failed to fetch notifications", error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, [hostName]);

  // Handle socket updates
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (data: any) => {
        // Optimistically add to list
        const newNotif: NotificationItem = {
            ...data,
            created_at: data.created_at || new Date().toISOString(),
            is_read: false
        };
        setNotifications(prev => [newNotif, ...prev]);
        toast.success(newNotif.title || "New Notification");
    };

    socket.on("new_notification", handleNewNotification);

    return () => {
      socket.off("new_notification", handleNewNotification);
    };
  }, [socket]);

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        // Mark as read API
        await fetch(`${hostName}/api/notifications/${notification.id}/read`, {
            method: 'PATCH',
            credentials: 'include'
        });
        
        // Update local state
        setNotifications(prev => 
            prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );

        // Dispatch event for Navbar
        window.dispatchEvent(new Event('notification_update'));
      }
      
      if (notification.link) {
        router.push(notification.link);
      }
    } catch (error) {
      console.error("Error clicking notification", error);
    }
  };

  const handleMarkAllRead = async () => {
      try {
          await fetch(`${hostName}/api/notifications/read-all`, {
              method: 'PUT',
              credentials: 'include'
          });
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
          window.dispatchEvent(new Event('notification_update'));
          toast.success("All marked as read");
      } catch (error) {
          toast.error("Failed to mark all read");
      }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading notifications...</div>;

  return (
    <div className="w-full max-w-2xl mx-auto font-ddin">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-6 border-b border-megaweave-sand bg-gradient-to-r from-megaweave-cream to-white flex justify-between items-center">
            <h2 className="text-2xl font-bold text-megaweave-forest-dark">
                Notifications
            </h2>
            <button 
                onClick={handleMarkAllRead}
                className="text-sm text-megaweave-green hover:underline"
            >
                Mark all as read
            </button>
        </div>

        {/* Content */}
        <div className="bg-slate-50/50 min-h-[400px]">
          <div className="divide-y divide-gray-100">
            <AnimatePresence mode="popLayout">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
                   <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => handleNotificationClick(n)}
                    className={`group flex gap-4 p-4 transition-all duration-200 cursor-pointer hover:bg-white ${
                        n.is_read ? 'bg-transparent opacity-70' : 'bg-blue-50/30'
                    }`}
                  >
                    <div className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full ${
                        n.type === 'LIKE' ? 'bg-pink-100 text-pink-500' :
                        n.type === 'COMMENT' ? 'bg-blue-100 text-blue-500' :
                        'bg-green-100 text-green-500'
                    }`}>
                      {/* Icon based on type */}
                      {n.type === 'LIKE' ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                      ) : n.type === 'COMMENT' ? (
                          <MessageIcon className="w-5 h-5" />
                      ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                          <h4 className={`font-semibold text-sm ${n.is_read ? 'text-gray-700' : 'text-gray-900'}`}>{n.title}</h4>
                          <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                      </div>
                      <p className={`text-sm mt-1 line-clamp-2 ${n.is_read ? 'text-gray-500' : 'text-gray-800'}`}>
                        {n.content}
                      </p>
                    </div>
                    {!n.is_read && (
                        <div className="self-center w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
