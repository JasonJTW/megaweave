"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import toast from "react-hot-toast";

interface MessageButtonProps {
  recipientPublicId: string;
  recipientName: string;
  className?: string; // Allow custom styling
}

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export const MessageButton: React.FC<MessageButtonProps> = ({
  recipientPublicId,
  recipientName,
  className,
}) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleMessageClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${hostName}/api/messages/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipient_public_id: recipientPublicId }),
      });

      if (!res.ok) {
          if (res.status === 401) {
              toast.error("Please sign in to message.");
              router.push(`/signin?returnTo=${encodeURIComponent(window.location.href)}`);
              return;
          }
          throw new Error("Failed to start conversation");
      }

      const data = await res.json();
      router.push(`/messages/${data.conversationId}`);
    } catch (error) {
      console.error("Message error:", error);
      toast.error(`Could not message ${recipientName}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
        onClick={handleMessageClick} 
        disabled={loading}
        variant="outline"
        size="sm"
        className={className}
    >
      <MessageSquare className="w-4 h-4 mr-2" />
      {loading ? "Loading..." : "Message"}
    </Button>
  );
};
