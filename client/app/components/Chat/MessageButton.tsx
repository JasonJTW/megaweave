"use client";

import { useRouter } from "@/i18n/navigation";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import { signinUrlForCurrentPage } from "@/lib/returnTo";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";

interface MessageButtonProps {
  recipientPublicId: string;
  recipientName: string;
  className?: string; // Allow custom styling
}

export const MessageButton: React.FC<MessageButtonProps> = ({
  recipientPublicId,
  recipientName,
  className,
}) => {
  const router = useRouter();
  const t = useTranslations("Chat");
  const apiErrorMessage = useApiErrorMessage();
  const [loading, setLoading] = useState(false);

  const handleMessageClick = async () => {
    setLoading(true);
    try {
      const data = await api<{ conversationId: number }>(
        "/api/messages/start",
        { method: "POST", body: { recipient_public_id: recipientPublicId } },
      );
      router.push(`/messages/${data.conversationId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        toast.error(t("signInToMessage"));
        router.push(signinUrlForCurrentPage());
        return;
      }
      console.error("Message error:", error);
      toast.error(
        apiErrorMessage(error, t("messageFailed", { username: recipientName })),
      );
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
      <MessageSquare className="mr-2 h-4 w-4" />
      {loading ? t("loading") : t("message")}
    </Button>
  );
};
