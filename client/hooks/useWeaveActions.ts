import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { Weave } from "@/services/weaveService";
import { useSocket } from "@/hooks/useSocket";
import { getWeaveViewModel, type WeaveAction } from "@/utils/weaveViewModel";

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
  /** Actions the current user may take, from the Weave view model. */
  availableActions: ReadonlySet<WeaveAction>;

  // Status
  localStatus: Weave["status"] | undefined;
  isProcessing: boolean;

  // Handlers
  handleApproveWeave: (e: React.MouseEvent) => Promise<void>;
  handleRejectWeave: (e: React.MouseEvent) => Promise<void>;
  handleCompleteWeave: (e: React.MouseEvent) => Promise<void>;
  handleCancelWeave: (e: React.MouseEvent) => Promise<void>;
  handleWithdrawWeave: (e: React.MouseEvent) => Promise<void>;
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

  const availableActions = weave
    ? getWeaveViewModel({
        status: localStatus,
        viewerId: currentUserId,
        postAuthorId: weave.post?.user_id,
        giverId: weave.giver_id,
        receiverId: weave.receiver_id,
        giverConfirmed: localGiverConfirmed,
        receiverConfirmed: localReceiverConfirmed,
      }).actions
    : new Set<WeaveAction>();

  const handleApproveWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("approve")) {
      toast.error("Only the post author can approve this request");
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
    if (!availableActions.has("decline")) {
      toast.error("Only the post author can decline this request");
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
    if (!availableActions.has("confirm")) {
      toast.error("You cannot confirm this weave right now");
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
    if (!availableActions.has("cancel")) {
      toast.error("You cannot cancel this weave right now");
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

  const handleWithdrawWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("withdraw")) {
      toast.error("You cannot withdraw this request right now");
      return;
    }
    if (!window.confirm("Are you sure you want to withdraw this request?"))
      return;

    setIsProcessing(true);
    try {
      const response = await fetch(
        `${hostName}/api/weaves/${weave.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "withdrawn" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.errorMessage || "Failed to withdraw request");

      setLocalStatus("withdrawn");
      toast.success("Request withdrawn.");
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to withdraw request",
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
    availableActions,
    localStatus,
    isProcessing,
    handleApproveWeave,
    handleRejectWeave,
    handleCompleteWeave,
    handleCancelWeave,
    handleWithdrawWeave,
  };
}
