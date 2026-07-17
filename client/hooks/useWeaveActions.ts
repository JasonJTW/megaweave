import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { Weave } from "@/services/weaveService";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

interface UseWeaveActionsOptions {
  weave: Weave | undefined;
  currentUserId: number | undefined;
  onWeaveStatusChange?: () => void;
}

export interface WeaveActions {
  // Role flags
  isGiver: boolean;
  isReceiver: boolean;
  hasIConfirmed: boolean;
  hasOtherConfirmed: boolean;

  // Status
  localStatus: Weave["status"] | undefined;
  isProcessing: boolean;

  // Handlers
  handleCompleteWeave: (e: React.MouseEvent) => Promise<void>;
  handleCancelWeave: (e: React.MouseEvent) => Promise<void>;
}

export function useWeaveActions({
  weave,
  currentUserId,
  onWeaveStatusChange,
}: UseWeaveActionsOptions): WeaveActions {
  const [isProcessing, setIsProcessing] = useState(false);
  const [localStatus, setLocalStatus] = useState(weave?.status);
  const [localGiverConfirmed, setLocalGiverConfirmed] = useState(
    !!weave?.giver_confirmed,
  );
  const [localReceiverConfirmed, setLocalReceiverConfirmed] = useState(
    !!weave?.receiver_confirmed,
  );

  // Sync local state when the weave prop updates (e.g. after parent refetch)
  useEffect(() => {
    setLocalStatus(weave?.status);
    setLocalGiverConfirmed(!!weave?.giver_confirmed);
    setLocalReceiverConfirmed(!!weave?.receiver_confirmed);
  }, [weave?.status, weave?.giver_confirmed, weave?.receiver_confirmed]);

  const isGiver = currentUserId === weave?.giver_id;
  const isReceiver = currentUserId === weave?.receiver_id;
  const hasIConfirmed = isGiver ? localGiverConfirmed : localReceiverConfirmed;
  const hasOtherConfirmed = isGiver
    ? localReceiverConfirmed
    : localGiverConfirmed;

  const handleCompleteWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing || hasIConfirmed) return;
    if (!isGiver && !isReceiver) {
      toast.error("You are not authorized to complete this weave");
      return;
    }

    const confirmMessage = isReceiver
      ? "Have you physically received the item? This action cannot be undone once both parties confirm."
      : "Have you handed over or shipped the item? The transaction will close once the receiver also confirms.";
    if (!window.confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "completed" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to update");

      if (data.newStatus === "completed") {
        setLocalStatus("completed");
        setLocalGiverConfirmed(true);
        setLocalReceiverConfirmed(true);
        toast.success("Transaction fully completed!");
      } else {
        if (isGiver) setLocalGiverConfirmed(true);
        if (isReceiver) setLocalReceiverConfirmed(true);
        toast.success(
          "Your confirmation received. Waiting for the other party.",
        );
      }
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (
      currentUserId !== weave.giver_id &&
      currentUserId !== weave.receiver_id
    ) {
      toast.error("You are not authorized to cancel this weave");
      return;
    }
    if (weave.status !== "pending") {
      toast.error(`Weave is already ${weave.status}`);
      return;
    }
    if (!window.confirm("Are you sure you want to cancel this weave?")) return;

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "cancelled" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to cancel weave");

      setLocalStatus("cancelled");
      toast.success("Weave cancelled successfully!");
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel weave",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isGiver,
    isReceiver,
    hasIConfirmed,
    hasOtherConfirmed,
    localStatus,
    isProcessing,
    handleCompleteWeave,
    handleCancelWeave,
  };
}
