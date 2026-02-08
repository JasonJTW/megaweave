// client/hooks/useSocket.ts
import { useContext } from "react";
import { SocketContext } from "@/app/contexts/SocketContext";

export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (!context) {
      console.warn("useSocket called outside of SocketProvider");
      return { socket: null, isConnected: false };
  }

  return { socket: context.socket, isConnected: context.isConnected };
};

