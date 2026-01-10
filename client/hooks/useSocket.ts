// client/hooks/useSocket.ts
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export const useSocket = (userId: string | null) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // 建立連線 (請換成你的伺服器網址)
    const socketInstance = io(hostName, {
      withCredentials: true,
    });

    socketInstance.on("connect", () => {
      console.log("✅ Connected to Socket Server, ID:", socketInstance.id);
      setIsConnected(true);

      // 測試：連線成功後立即加入房間
      socketInstance.emit("join_room", userId);
    });

    socketInstance.on("disconnect", () => {
      console.log("❌ Disconnected");
      setIsConnected(false);
    });

    setSocket(socketInstance);

    // 組件卸載時斷開連線
    return () => {
      socketInstance.disconnect();
    };
  }, [userId]);

  return { socket, isConnected };
};
