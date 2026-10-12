"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "./UserContext";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

export const SocketContext = createContext<SocketContextType | undefined>(
  undefined,
);

export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading } = useUser();
  const userId = user?.userId;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only connect if we have a user and aren't loading
    if (loading || !userId) {
      return;
    }

    // Don't reconnect if we already have a socket for this user
    // However, if userId changes, we need to reconnect. The dependency array handles this.

    console.log("🔌 Initializing socket for user:", userId);

    const socketInstance = io(hostName || "", {
      // Server 在 handshake 時讀 session cookie 驗證身分並自動加入個人 room
      withCredentials: true,
    });

    socketInstance.on("connect", () => {
      console.log("✅ Connected to Socket Server, ID:", socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (err) => {
      console.error("❌ Socket Connection Error:", err.message);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [userId, loading]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
