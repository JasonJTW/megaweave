import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { Weave } from "@/services/weaveService";
import { useSocket } from "@/hooks/useSocket";

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
  handleApproveWeave: (e: React.MouseEvent) => Promise<void>;
  handleRejectWeave: (e: React.MouseEvent) => Promise<void>;
  handleCompleteWeave: (e: React.MouseEvent) => Promise<void>;
  handleCancelWeave: (e: React.MouseEvent) => Promise<void>;
}

export function useWeaveActions({
  weave,
  currentUserId,
  onWeaveStatusChange,
}: UseWeaveActionsOptions): WeaveActions {
  const { socket } = useSocket();
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

  // Real-time socket status updates
  useEffect(() => {
    if (!socket || !weave?.id) return;

    const handleStatusUpdate = (data: {
      weaveId: number;
      status: Weave["status"];
      giver_confirmed?: boolean;
      receiver_confirmed?: boolean;
    }) => {
      if (Number(data.weaveId) === Number(weave.id)) {
        setLocalStatus(data.status);
        if (typeof data.giver_confirmed === "boolean") {
          setLocalGiverConfirmed(data.giver_confirmed);
        }
        if (typeof data.receiver_confirmed === "boolean") {
          setLocalReceiverConfirmed(data.receiver_confirmed);
        }
        onWeaveStatusChange?.();
      }
    };

    socket.on("weave_status_updated", handleStatusUpdate);
    return () => {
      socket.off("weave_status_updated", handleStatusUpdate);
    };
  }, [socket, weave?.id, onWeaveStatusChange]);

  const isGiver = currentUserId === weave?.giver_id;
  const isReceiver = currentUserId === weave?.receiver_id;
  const hasIConfirmed = isGiver ? localGiverConfirmed : localReceiverConfirmed;
  const hasOtherConfirmed = isGiver
    ? localReceiverConfirmed
    : localGiverConfirmed;

  const handleApproveWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!isGiver) {
      toast.error("Only the item giver can approve this request");
      return;
    }
    if (localStatus !== "requested") {
      toast.error(`Weave request is no longer pending approval`);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "pending" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to approve request");

      setLocalStatus("pending");
      toast.success("Request approved! Transaction is now in progress.");
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve request",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!isGiver) {
      toast.error("Only the item giver can reject this request");
      return;
    }
    if (localStatus !== "requested") {
      toast.error(`Weave request is no longer pending approval`);
      return;
    }
    if (!window.confirm("Are you sure you want to reject this request?")) return;

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "rejected" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to reject request");

      setLocalStatus("rejected");
      toast.success("Request rejected.");
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reject request",
      );
    } finally {
      setIsProcessing(false);
    }
  };

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
    if (localStatus !== "requested" && localStatus !== "pending") {
      toast.error(`Weave is already ${localStatus}`);
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
    handleApproveWeave,
    handleRejectWeave,
    handleCompleteWeave,
    handleCancelWeave,
  };
}
