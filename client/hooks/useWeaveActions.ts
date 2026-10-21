import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import type { Weave } from "@/services/weaveService";
import { useSocket } from "@/hooks/useSocket";
import {
  getWeaveViewModel,
  type WeaveAction,
  type WeaveHintKey,
  type WeaveStatusKey,
} from "@/utils/weaveViewModel";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

async function patchWeaveStatus(
  weaveId: number,
  status: Weave["status"],
  fallbackError: string,
) {
  const response = await fetch(`${hostName}/api/weaves/${weaveId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.errorMessage || fallbackError);
  return data;
}

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
  /** Status badge / hint i18n keys, from the Weave view model. */
  statusKey: WeaveStatusKey | null;
  hintKey: WeaveHintKey | null;

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
  const t = useTranslations("WeaveCard");
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

  const viewModel = weave
    ? getWeaveViewModel({
        status: localStatus,
        viewerId: currentUserId,
        postAuthorId: weave.post?.user_id,
        giverId: weave.giver_id,
        receiverId: weave.receiver_id,
        giverConfirmed: localGiverConfirmed,
        receiverConfirmed: localReceiverConfirmed,
      })
    : undefined;
  const availableActions = viewModel?.actions ?? new Set<WeaveAction>();

  const handleApproveWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("approve")) {
      toast.error(t("toast.onlyAuthorCanApprove"));
      return;
    }
    if (localStatus !== "requested") {
      toast.error(t("toast.notAwaitingApproval"));
      return;
    }

    setIsProcessing(true);
    try {
      await patchWeaveStatus(weave.id, "approved", t("toast.approveFailed"));

      setLocalStatus("approved");
      toast.success(t("toast.approved"));
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.approveFailed"),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("decline")) {
      toast.error(t("toast.onlyAuthorCanDecline"));
      return;
    }
    if (!window.confirm(t("prompts.decline"))) return;

    setIsProcessing(true);
    try {
      await patchWeaveStatus(weave.id, "declined", t("toast.declineFailed"));

      setLocalStatus("declined");
      toast.success(t("toast.declined"));
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.declineFailed"),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing || hasIConfirmed) return;
    if (!availableActions.has("confirm")) {
      toast.error(t("toast.cannotConfirm"));
      return;
    }

    const confirmMessage = t(
      isReceiver ? "prompts.confirmReceipt" : "prompts.confirmHandover",
    );
    if (!window.confirm(confirmMessage)) return;

    setIsProcessing(true);
    try {
      const data = await patchWeaveStatus(
        weave.id,
        "completed",
        t("toast.confirmFailed"),
      );

      if (data.newStatus === "completed") {
        setLocalStatus("completed");
        setLocalGiverConfirmed(true);
        setLocalReceiverConfirmed(true);
        toast.success(t("toast.completed"));
      } else {
        if (isGiver) setLocalGiverConfirmed(true);
        if (isReceiver) setLocalReceiverConfirmed(true);
        toast.success(t("toast.confirmedWaiting"));
      }
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.confirmFailed"),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("cancel")) {
      toast.error(t("toast.cannotCancel"));
      return;
    }
    if (!window.confirm(t("prompts.cancel"))) return;

    setIsProcessing(true);
    try {
      await patchWeaveStatus(weave.id, "cancelled", t("toast.cancelFailed"));

      setLocalStatus("cancelled");
      toast.success(t("toast.cancelled"));
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.cancelFailed"),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdrawWeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!weave || isProcessing) return;
    if (!availableActions.has("withdraw")) {
      toast.error(t("toast.cannotWithdraw"));
      return;
    }
    if (!window.confirm(t("prompts.withdraw"))) return;

    setIsProcessing(true);
    try {
      await patchWeaveStatus(weave.id, "withdrawn", t("toast.withdrawFailed"));

      setLocalStatus("withdrawn");
      toast.success(t("toast.withdrawn"));
      onWeaveStatusChange?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.withdrawFailed"),
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
    statusKey: viewModel?.statusKey ?? null,
    hintKey: viewModel?.hintKey ?? null,
    localStatus,
    isProcessing,
    handleApproveWeave,
    handleRejectWeave,
    handleCompleteWeave,
    handleCancelWeave,
    handleWithdrawWeave,
  };
}
