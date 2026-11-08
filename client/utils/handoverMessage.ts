//* 交接的系統訊息（#142、ADR 0004）：server 在原對話（moved_out）與新對話（moved_in）各寫一則，
//* metadata.other_conversation_id 指向另一個對話。連結只給申請人：寫這則訊息的窗口不在另一個對話裡

export interface HandoverNotice {
  kind: "movedOut" | "movedIn";
  title: string;
  /** 要連過去的對話；檢視者是寫這則訊息的窗口時為 null */
  otherConversationId: number | null;
}

interface HandoverMessageLike {
  message_type?: string;
  metadata?: unknown;
  sender_public_id?: string;
}

const KINDS = { moved_out: "movedOut", moved_in: "movedIn" } as const;

export function handoverNotice(
  message: HandoverMessageLike,
  myPublicId: string,
): HandoverNotice | null {
  if (message.message_type !== "system_handover") return null;
  let meta: unknown = message.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  if (!meta || typeof meta !== "object") return null;
  const { handover, item_title, other_conversation_id } = meta as Record<
    string,
    unknown
  >;
  const kind = KINDS[handover as keyof typeof KINDS];
  if (!kind) return null;
  const other = Number(other_conversation_id);
  return {
    kind,
    title: typeof item_title === "string" ? item_title : "",
    otherConversationId:
      Number.isInteger(other) &&
      other > 0 &&
      message.sender_public_id !== myPublicId
        ? other
        : null,
  };
}
