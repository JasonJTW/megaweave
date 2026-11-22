"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useSWRConfig } from "swr";
import { useUser } from "./UserContext";
import { invalidateWeave } from "@/lib/weave";

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
  const { mutate } = useSWRConfig();

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

    //* Weave 改變（任何一方的操作或系統婉拒）：全站只有這一個 listener，
    //* 讓單筆、我的頁面與 Weave 清單重抓（lib/weave）
    socketInstance.on("weave_status_updated", (data: { weaveId: number }) => {
      void invalidateWeave(mutate, data.weaveId);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [userId, loading, mutate]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
