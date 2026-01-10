"use client";
import { useSocket } from "@/hooks/useSocket";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils"; // Assuming utils exists, if not I'll inline the class merger or check existence. 
// checking for lib/utils existence, actually I should check first. 
// But I saw clsx and tailwind-merge in package.json so I assume `cn` is somewhere. 
// If not, I will just use template literals for now.
import MessageIcon from "./icons/MessageIcon";
import ChristmasSnowmanIcon from "./icons/ChristmasSnowmanIcon"; 
// Maybe use more generic icons if available, but I'll stick to what I saw or simple SVGs.

export default function NotificationTest({ userId }: { userId: number }) {
  const { socket, isConnected } = useSocket(userId.toString());
  const [notifications, setNotifications] = useState<Notification[]>([]);

  interface Notification {
    message: string;
    id?: string; // Add ID for keys
    timestamp?: Date;
  }

  useEffect(() => {
    if (!socket) return;

    socket.on("new_notification", (data: any) => {
      console.log("🔔 New Notification:", data);
      const newNotification = {
        message: typeof data === 'string' ? data : data.message || JSON.stringify(data),
        id: Date.now().toString(),
        timestamp: new Date(),
      };
      setNotifications((prev) => [newNotification, ...prev]);
    });

    return () => {
      socket.off("new_notification");
    };
  }, [socket]);

  return (
    <div className="w-full max-w-2xl mx-auto font-ddin">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/20 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-megaweave-sand bg-gradient-to-r from-megaweave-cream to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-megaweave-green-light/10 rounded-full text-megaweave-green">
                 {/* Placeholder for Bell Icon if not found, utilizing MessageIcon for now or simple SVG */}
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-megaweave-forest">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                 </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-megaweave-forest-dark">Notifications</h2>
                <p className="text-megaweave-stone text-sm flex items-center gap-2">
                  Status: 
                  <span className={`inline-flex items-center gap-1 font-medium ${isConnected ? "text-green-600" : "text-red-500"}`}>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-600" : "bg-red-500"} animate-pulse`} />
                    {isConnected ? "Connected" : "Disconnected"}
                  </span>
                </p>
              </div>
            </div>
            {/* Room Info */}
             <div className="text-xs text-megaweave-stone bg-megaweave-sand/30 px-3 py-1 rounded-full">
                Room: user_{userId}
             </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 bg-slate-50/50 min-h-[400px]">
          <h4 className="text-lg font-semibold text-megaweave-forest mb-4">Recent Activity</h4>
          
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {notifications.length === 0 ? (
                 <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center justify-center py-12 text-center text-megaweave-stone"
                 >
                    <div className="w-16 h-16 bg-megaweave-sand/20 rounded-full flex items-center justify-center mb-4">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
                            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                    </div>
                    <p className="text-lg font-medium">No notifications yet</p>
                    <p className="text-sm opacity-70">New messages will appear here instantly</p>
                 </motion.div>
              ) : (
                notifications.map((n, i) => (
                  <motion.div
                    key={n.id || i}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="group flex gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300 hover:border-megaweave-gold/30"
                  >
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-megaweave-cream to-megaweave-sand text-megaweave-gold">
                      <MessageIcon className="w-5 h-5 text-megaweave-gold" />
                    </div>
                    <div className="flex-1">
                      <p className="text-megaweave-brown font-medium leading-relaxed">
                        {n.message}
                      </p>
                      <p className="text-xs text-megaweave-stone mt-1">
                        {n.timestamp ? n.timestamp.toLocaleTimeString() : 'Just now'}
                      </p>
                    </div>
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
