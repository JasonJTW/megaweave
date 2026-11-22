//* Weave 的 commit 後副作用：站內通知、Email、Socket 推播、統計。全部在交易 commit 之後做，
//* 失敗只記 log，不影響已生效的狀態
import type { RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import dbPool from "../../utils/db";
import { createNotification, type NotificationType } from "../../utils/notificationService";
import { messageService } from "../../utils/messageService";
import { updateUserStats } from "../../utils/updateUserStats";
import { enqueueSendEmail } from "../../queue/queues";
import type { WeaveItem } from "../../emails/EmailTemplate";
import { getTranslator } from "../../utils/i18n";
import { getAppOrigin } from "../../utils/env";
import { orgSideNameFor } from "../orgPublisher";
import { availableOf, isWholePostRequest } from "./inventory";
import type { WeaveRole, WeaveStatus } from "./types";

export async function buildSystemMessageMeta(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
  weaveId: number,
  postType: string,
  postOwnerId: number,
) {
  const [postItems] = await dbPool.execute<RowDataPacket[]>(
    `SELECT id, title, quantity, reserved_quantity FROM items WHERE post_id = ?`,
    [postId],
  );

  const isAll = isWholePostRequest(
    items,
    postItems.map((pi) => ({
      id: Number(pi.id),
      quantity: availableOf(pi),
    })),
  );

  let itemTitle = "All";
  let firstItemId: number | null = null;

  if (isAll) {
    itemTitle = "All";
    firstItemId = null;
  } else if (items.length === 1 && items[0]?.itemId) {
    const matched = postItems.find((pi) => pi.id === items[0].itemId);
    itemTitle = (matched?.title as string) || "Item";
    firstItemId = items[0].itemId;
  } else if (items.length > 1) {
    const matched = postItems.find((pi) => pi.id === items[0].itemId);
    const baseTitle = (matched?.title as string) || "Item";
    itemTitle = `${baseTitle} +${items.length - 1} more`;
    firstItemId = items[0].itemId;
  }

  const [imgRows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT s3_key FROM images WHERE post_id = ? ORDER BY id ASC LIMIT 1`,
    [postId],
  );
  const imageS3Key = imgRows.length > 0 ? (imgRows[0].s3_key as string) : null;
  const postAuthorPublicId =
    await messageService.getPublicIdByUserId(postOwnerId);

  return {
    item_id: firstItemId,
    item_title: itemTitle,
    quantity: items[0]?.quantity ?? 1,
    weave_id: weaveId,
    post_id: postId,
    image_s3_key: imageS3Key,
    post_type: postType,
    post_author_public_id: postAuthorPublicId,
    is_all: isAll,
  };
}

// ─── Notification & Email Helpers ─────────────────────────────────────────────

export type WeaveActionType =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "withdrawn"
  | "confirmed"
  | "completed";

//* 站內通知的 type：client 依 type + params 用讀者語言組句
const WEAVE_NOTIFICATION_TYPE = {
  requested: "WEAVE_REQUESTED",
  approved: "WEAVE_APPROVED",
  declined: "WEAVE_DECLINED",
  cancelled: "WEAVE_CANCELLED",
  withdrawn: "WEAVE_WITHDRAWN",
  confirmed: "WEAVE_CONFIRMED",
  completed: "WEAVE_COMPLETED",
} as const satisfies Record<WeaveActionType, NotificationType>;

/**
 * 站內通知的 type 與英文標題、內容（與 Email 共用 WeaveNotice 翻譯）。
 * 英文只給 log 與舊 client fallback；畫面由 client 依 type + params 用讀者語言組句，Email 由 email job 依收件人語系產生。
 */
function getWeaveNoticeCopy(
  action: WeaveActionType,
  actorName: string,
  postTitle: string,
) {
  const t = getTranslator("en", "WeaveNotice");
  const values = { actorName, postTitle };
  return {
    type: WEAVE_NOTIFICATION_TYPE[action],
    title: t(`${action}.title`, values),
    content: t(`${action}.content`, values),
  };
}

export async function getWeaveItemsList(
  weaveId: number,
  _postId: number,
): Promise<WeaveItem[]> {
  const [weaveItems] = await dbPool.execute<RowDataPacket[]>(
    `SELECT item_id, quantity FROM weave_items WHERE weave_id = ?`,
    [weaveId],
  );

  const result: WeaveItem[] = [];

  for (const item of weaveItems) {
    if (item.item_id === null) {
      // All-items weave — no specific item selected; the email shows "All items"
      result.push({ title: null, quantity: null });
    } else {
      const qty: number = item.quantity ?? 1;
      const [itemRows] = await dbPool.execute<RowDataPacket[]>(
        `SELECT title FROM items WHERE id = ?`,
        [item.item_id],
      );
      if (itemRows.length > 0) {
        result.push({ title: itemRows[0].title as string, quantity: qty });
      } else {
        result.push({ title: null, quantity: qty });
      }
    }
  }

  return result;
}

interface NotifyWeaveStatusParams {
  io: Server | null;
  weaveId: number;
  /** 組織物品的組織方以組織名義通知不是成員的人（#140、ADR 0004） */
  postId: number;
  recipientId: number;
  senderId: number | null;
  actorName: string;
  postTitle: string;
  action: WeaveActionType;
  items: WeaveItem[];
  recipientRole: WeaveRole;
  /** 預設連到收件人的 Weave 清單；不是 Weave 一方的審核者（#137）連到組織物品管理頁 */
  link?: string;
}

/**
 * 統一派發站內通知 (Socket + DB) 與 站外 Email (BullMQ Queue)
 */
export async function notifyWeaveStatusChange(params: NotifyWeaveStatusParams) {
  const { io, weaveId, postId, recipientId, postTitle, action, items, recipientRole } = params;
  let { senderId, actorName } = params;
  //* 組織物品：組織方（窗口、管理員、系統）通知不是該組織成員的人時，以組織名義、不記個人寄件人
  if (senderId !== recipientId) {
    const orgName = await orgSideNameFor(dbPool, postId, recipientId);
    if (orgName !== null) {
      actorName = orgName;
      senderId = null;
    }
  }

  const copy = getWeaveNoticeCopy(action, actorName, postTitle);

  const link = params.link ?? `/user?highlightWeaveId=${weaveId}`;

  // 1. 站內通知 (Socket + DB)
  if (io) {
    createNotification(io, {
      recipient_id: recipientId,
      sender_id: senderId,
      type: copy.type,
      title: copy.title,
      content: copy.content,
      params: { actorName, postTitle },
      link,
    }).catch((e) => console.error("🔔 Notification creation failed:", e));
  }

  // 2. 站外 Email (Queue)：email job 依收件人的 users.locale 產生文案
  try {
    await enqueueSendEmail({
      template: "weave-status",
      recipientId,
      action,
      actorName,
      postTitle,
      weaveId,
      items,
      recipientRole,
      ctaUrl: `${getAppOrigin()}${link}`,
    });
  } catch (e) {
    console.error("📧 Enqueue email failed:", e);
  }
}


// ─── Socket ───────────────────────────────────────────────────────────────────

export interface WeaveConfirmState {
  status: WeaveStatus;
  giver_confirmed: boolean;
  receiver_confirmed: boolean;
}

/** `weave_status_updated` 唯一的 payload 形狀 */
export function weaveStatusPayload(weaveId: number, state: WeaveConfirmState) {
  return {
    weaveId,
    status: state.status,
    giver_confirmed: state.giver_confirmed,
    receiver_confirmed: state.receiver_confirmed,
  };
}

function emitWeaveStatus(
  io: Server,
  weaveId: number,
  state: WeaveConfirmState,
  userIds: Iterable<number>,
): void {
  const payload = weaveStatusPayload(weaveId, state);
  for (const id of new Set(userIds)) io.to(`user_${id}`).emit("weave_status_updated", payload);
}

async function readConfirmState(weaveId: number): Promise<WeaveConfirmState> {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
    [weaveId],
  );
  return {
    status: rows[0]?.status as WeaveStatus,
    giver_confirmed: Boolean(rows[0]?.giver_confirmed),
    receiver_confirmed: Boolean(rows[0]?.receiver_confirmed),
  };
}

async function postTitleOf(postId: number): Promise<string> {
  const [details] = await dbPool.execute<RowDataPacket[]>(
    `SELECT p.title FROM posts p WHERE p.id = ?`,
    [postId],
  );
  return (details[0]?.title as string) ?? "Item";
}

// ─── Transitions ──────────────────────────────────────────────────────────────

export interface AnnouncedTransition {
  weaveId: number;
  postId: number;
  giverId: number;
  receiverId: number;
  actor: { id: number; name: string };
  /** 通知用的動作；單方確認是 confirmed，雙方都確認是 completed */
  action: Exclude<WeaveActionType, "requested">;
}

/**
 * 一次人為轉移 commit 之後：通知對方（completed 時動作者也收到）、推播給兩造與動作者
 * （審核者可能不是兩造）、完成時重算兩造統計
 */
export async function announceTransition(
  io: Server | null,
  transition: AnnouncedTransition,
): Promise<void> {
  const { weaveId, postId, giverId, receiverId, actor, action } = transition;
  //* 對方：動作者是 Receiver 就通知 Giver，否則通知 Receiver（不是兩造的審核者站在 Giver 這一側）
  const recipientId = receiverId === actor.id ? giverId : receiverId;
  const roleOf = (id: number): WeaveRole => (id === giverId ? "giver" : "receiver");
  try {
    const postTitle = await postTitleOf(postId);
    const items = await getWeaveItemsList(weaveId, postId);
    const notify = (to: number) =>
      notifyWeaveStatusChange({
        io,
        weaveId,
        postId,
        recipientId: to,
        senderId: actor.id,
        actorName: actor.name,
        postTitle,
        action,
        items,
        recipientRole: roleOf(to),
      });
    await notify(recipientId);
    if (action === "completed") await notify(actor.id);
  } catch (error) {
    console.error("[weave] Transition notification failed:", error);
  }
  if (io) {
    try {
      emitWeaveStatus(io, weaveId, await readConfirmState(weaveId), [
        giverId,
        receiverId,
        actor.id,
      ]);
    } catch (error) {
      console.error("[weave] Socket emit failed:", error);
    }
  }
  if (action === "completed") {
    updateUserStats(giverId.toString()).catch(console.error);
    updateUserStats(receiverId.toString()).catch(console.error);
  }
}

// ─── System decline ───────────────────────────────────────────────────────────

/** 系統代為婉拒的 Weave（#142 移除成員、#138 降級） */
export interface AutoDeclinedWeave {
  id: number;
  postId: number;
  giverId: number;
  receiverId: number;
}

/**
 * 交易 commit 後通知系統代為婉拒的申請：申請人（Receiver）收到 declined 通知與 Email，
 * 兩造的畫面收到 weave_status_updated。`actorName` 用組織名稱，不曝光操作的管理員。失敗只記 log。
 * `actor.id` 為 null 代表系統操作（#139 自動升級），通知的 sender 改記 Giver。
 */
export async function announceAutoDeclined(
  io: Server | null,
  weaves: readonly AutoDeclinedWeave[],
  actor: { id: number | null; name: string },
): Promise<void> {
  for (const weave of weaves) {
    try {
      const postTitle = await postTitleOf(weave.postId);
      await notifyWeaveStatusChange({
        io,
        weaveId: weave.id,
        postId: weave.postId,
        recipientId: weave.receiverId,
        senderId: actor.id ?? weave.giverId,
        actorName: actor.name,
        postTitle,
        action: "declined",
        items: await getWeaveItemsList(weave.id, weave.postId),
        recipientRole: "receiver",
      });
      if (io) {
        emitWeaveStatus(
          io,
          weave.id,
          { status: "declined", giver_confirmed: false, receiver_confirmed: false },
          [weave.giverId, weave.receiverId],
        );
      }
    } catch (error) {
      console.error("[announceAutoDeclined] Notification failed:", error);
    }
  }
}
