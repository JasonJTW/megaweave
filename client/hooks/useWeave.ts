"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  invalidateWeave,
  sendWeaveCommand,
  weaveKey,
  type Weave,
  type WeaveCommand,
  type WeaveCommandResult,
} from "@/lib/weave";
import { getWeaveViewModel, type WeaveViewModel } from "@/utils/weaveViewModel";

export interface UseWeave {
  weave: Weave | undefined;
  /** 標籤、提示與可做的動作（動作來自 server 的 viewer.commands） */
  view: WeaveViewModel;
  /** 看的人這一側已確認交接 */
  hasIConfirmed: boolean;
  isProcessing: boolean;
  /**
   * 下命令；成功後讓單筆、我的頁面與 Weave 清單一起重抓。動作不在 view.actions 或正在處理時回 null。
   * 失敗丟 ApiError，由呼叫端翻譯
   */
  perform: (command: WeaveCommand) => Promise<WeaveCommandResult | null>;
}

/**
 * 一筆 Weave 的即時狀態。`initial` 是清單已經帶來的資料（/api/me），有就不在掛載時重抓；
 * 之後的改變由 SocketContext 收到 weave_status_updated 時 invalidateWeave，或自己的 perform 觸發
 */
export function useWeave(
  weaveId: number | string | undefined,
  initial?: Weave,
): UseWeave {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ weave: Weave }>(
    weaveId ? weaveKey(weaveId) : null,
    {
      fallbackData: initial ? { weave: initial } : undefined,
      revalidateOnMount: !initial,
    },
  );
  const weave = data?.weave;
  const [isProcessing, setIsProcessing] = useState(false);

  const view = getWeaveViewModel({
    status: weave?.status,
    viewer: weave?.viewer,
    giverConfirmed: !!weave?.giver_confirmed,
    receiverConfirmed: !!weave?.receiver_confirmed,
  });
  const role = weave?.viewer?.role;
  const hasIConfirmed =
    role === "giver"
      ? !!weave?.giver_confirmed
      : role === "receiver" && !!weave?.receiver_confirmed;

  const perform = async (command: WeaveCommand) => {
    if (!weave || isProcessing || !view.actions.has(command)) return null;
    setIsProcessing(true);
    try {
      const result = await sendWeaveCommand(weave.id, command);
      await invalidateWeave(mutate, weave.id);
      return result;
    } finally {
      setIsProcessing(false);
    }
  };

  return { weave, view, hasIConfirmed, isProcessing, perform };
}
