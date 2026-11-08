// server/src/utils/weaveService.ts
// 深層模組：封裝所有 Weave 業務邏輯（驗證、DB、通知、Socket）
// 對外介面：requestWeave() 和 approveWeave()

import { RowDataPacket, ResultSetHeader } from "mysql2";
import { Pool, PoolConnection } from "mysql2/promise";
import { Server } from "socket.io";
import dbPool from "./db";
import { acquireConnection } from "./acquireConnection";
import {
  createNotification,
  type NotificationType,
} from "./notificationService";
import { messageService } from "./messageService";
import { updateUserStats } from "./updateUserStats";
import { enqueueSendEmail } from "../queue/queues";
import type { WeaveItem } from "../emails/EmailTemplate";
import { ErrorCode } from "./errorCodes";
import { HttpError } from "./httpError";
import { getTranslator } from "./i18n";
import { getAppOrigin } from "./env";
import { viewerVisibility } from "../services/postVisibility";
import { orgSideNameFor } from "../services/orgPublisher";
import { loadConversationMask, presentMessage } from "../services/orgConversation";
import {
  actingUnitsFor,
  canReviewOrgRequest,
  resolveActingUnit,
} from "../services/orgWeaveService";
import type { OrgUnitRef } from "../services/orgItemService";
import {
  OrgWeaveEventAction,
  recordOrgWeaveEvents,
} from "../services/orgWeaveEvents";

// ─── Errors ───────────────────────────────────────────────────────────────────

export class WeaveError extends HttpError {
  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    params?: Record<string, string | number>,
  ) {
    super(statusCode, code, message, params);
    this.name = "WeaveError";
  }

  get httpStatus() {
    return this.statusCode;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeaveStatus =
  | "approved"
  | "requested"
  | "declined"
  | "cancelled"
  | "withdrawn"
  | "completed";

/** 物品流向：Giver 流出、Receiver 流入（見 CONTEXT.md） */
export type WeaveRole = "giver" | "receiver";

export interface RequestWeaveParams {
  postId: number;
  /** Normalised items. Pass [] when no specific items requested. */
  items: Array<{ itemId: number | null; quantity: number }>;
  notes?: string | null;
  /**
   * 組織貼文：申請人代表的單位（null = 我個人；省略 = client 沒問）。見 orgWeaveService.resolveActingUnit
   */
  actingUnitId?: number | null;
  initiator: {
    id: number;
    name: string;
    publicId: string;
  };
}

export interface RequestWeaveResult {
  weaveId: number;
  notificationSent: boolean;
}

export interface ApproveWeaveParams {
  weaveId: string;
  newStatus: WeaveStatus;
  userId: number;
  actorName: string;
}

export interface ApproveWeaveResult {
  newStatus: string;
  fullyCompleted: boolean;
}

interface WeaveRow extends RowDataPacket {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  /** Joined from posts: the Weave's Post Author (never the Initiator). */
  post_author_id: number;
  /** Joined from posts: the owning org/unit, NULL for personal posts. */
  post_org_id: number | null;
  post_org_unit_id: number | null;
  status: WeaveStatus;
  giver_confirmed: boolean | number;
  receiver_confirmed: boolean | number;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

interface ValidatedPost {
  user_id: number;
  status: string;
  type: string;
  org_id: number | null;
  org_unit_id: number | null;
}

async function validatePost(
  postId: number,
  initiatorId: number,
): Promise<ValidatedPost> {
  // 能認領 = 能看到（ADR 0003）：看不到的組織貼文與不存在一樣回 404
  const visibility = await viewerVisibility(dbPool, initiatorId);
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT p.user_id, p.status, p.type, p.org_id, p.org_unit_id FROM posts p WHERE p.id = ? AND ${visibility.sql}`,
    [postId, ...visibility.params],
  );
  if (rows.length === 0)
    throw new WeaveError(404, "POST_NOT_FOUND", "Post not found");
  if (rows[0].user_id === initiatorId)
    throw new WeaveError(400, "WEAVE_OWN_POST", "Cannot weave your own post");
  if (rows[0].status !== "active")
    throw new WeaveError(400, "POST_INACTIVE", "This post is no longer active");
  const row = rows[0];
  return {
    user_id: Number(row.user_id),
    status: row.status,
    type: row.type,
    org_id: row.org_id == null ? null : Number(row.org_id),
    org_unit_id: row.org_unit_id == null ? null : Number(row.org_unit_id),
  };
}

/**
 * 軟檢查：庫存是否足夠（無鎖，只做早期回饋；真正保證在 deductInventory）
 */
async function validateItems(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
  db: Pool | PoolConnection = dbPool,
): Promise<void> {
  for (const item of items) {
    if (!item.itemId) continue;
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT quantity, title FROM items WHERE id = ? AND post_id = ?`,
      [item.itemId, postId],
    );
    if (rows.length === 0)
      throw new WeaveError(
        404,
        "ITEM_UNAVAILABLE",
        `Item ${item.itemId} does not exist in this post`,
      );
    if (rows[0].quantity < item.quantity)
      throw new WeaveError(
        400,
        "INSUFFICIENT_STOCK",
        `Requested quantity (${item.quantity}) exceeds available stock (${rows[0].quantity}) for "${rows[0].title}"`,
        { title: rows[0].title, available: Number(rows[0].quantity) },
      );
  }
}

async function getWeaveStockItems(
  connection: PoolConnection,
  weaveId: string | number,
): Promise<Array<{ itemId: number; quantity: number }>> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT item_id, SUM(quantity) AS quantity
     FROM weave_items
     WHERE weave_id = ? AND item_id IS NOT NULL
     GROUP BY item_id`,
    [weaveId],
  );
  return rows.map((r) => ({
    itemId: Number(r.item_id),
    quantity: Number(r.quantity),
  }));
}

/**
 * 硬檢查 + 扣庫存：FOR UPDATE 鎖住 items 列後再比對，避免多筆 Weave 同時完成而扣成負數。
 * 不足時拋 WeaveError(400)，由呼叫端 rollback（Weave 維持 approved，雙方可再溝通）。
 */
async function deductInventory(
  connection: PoolConnection,
  weaveId: string | number,
): Promise<void> {
  const items = await getWeaveStockItems(connection, weaveId);
  if (items.length === 0) return;

  const ids = items.map((it) => it.itemId);
  const [stockRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, title, quantity FROM items
     WHERE id IN (${ids.map(() => "?").join(", ")})
     ORDER BY id
     FOR UPDATE`,
    ids,
  );
  const stockById = new Map(stockRows.map((r) => [Number(r.id), r]));

  for (const item of items) {
    const stock = stockById.get(item.itemId);
    if (!stock)
      throw new WeaveError(
        400,
        "ITEM_UNAVAILABLE",
        `Item ${item.itemId} is no longer available`,
      );
    if (Number(stock.quantity) < item.quantity)
      throw new WeaveError(
        400,
        "INSUFFICIENT_STOCK",
        `Insufficient stock for "${stock.title}": requested ${item.quantity}, available ${stock.quantity}`,
        { title: stock.title, available: Number(stock.quantity) },
      );
  }

  for (const item of items) {
    await connection.execute(
      `UPDATE items SET quantity = quantity - ? WHERE id = ?`,
      [item.quantity, item.itemId],
    );
  }
}

async function buildSystemMessageMeta(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
  weaveId: number,
  postType: string,
  postOwnerId: number,
) {
  const [postItems] = await dbPool.execute<RowDataPacket[]>(
    `SELECT id, title FROM items WHERE post_id = ?`,
    [postId],
  );

  const isAll =
    items.length === 0 ||
    items[0]?.itemId === null ||
    (postItems.length > 0 &&
      items.length === postItems.length &&
      items.every((it) => postItems.some((pi) => pi.id === it.itemId)));

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

async function getWeaveItemsList(
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
}

/**
 * 統一派發站內通知 (Socket + DB) 與 站外 Email (BullMQ Queue)
 */
async function notifyWeaveStatusChange(params: NotifyWeaveStatusParams) {
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

  const link = `/user?highlightWeaveId=${weaveId}`;

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

// ─── Public API ───────────────────────────────────────────────────────────────

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
      const [details] = await dbPool.execute<RowDataPacket[]>(
        `SELECT p.title FROM posts p WHERE p.id = ?`,
        [weave.postId],
      );
      const postTitle = (details[0]?.title as string) ?? "Item";
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
        const payload = {
          weaveId: weave.id,
          status: "declined",
          giver_confirmed: false,
          receiver_confirmed: false,
        };
        for (const id of new Set([weave.giverId, weave.receiverId])) {
          io.to(`user_${id}`).emit("weave_status_updated", payload);
        }
      }
    } catch (error) {
      console.error("[announceAutoDeclined] Notification failed:", error);
    }
  }
}

/**
 * 申請人在這篇貼文可以代表的單位（ADR 0004）；空陣列代表不顯示「代表誰」的選項。
 * 看不到的貼文回 404，與送出請求一致。
 */
export async function listActingUnits(
  postId: number,
  userId: number,
): Promise<OrgUnitRef[]> {
  const visibility = await viewerVisibility(dbPool, userId);
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    `SELECT p.type, p.org_id, p.org_unit_id FROM posts p
     WHERE p.id = ? AND p.deleted_at IS NULL AND ${visibility.sql}`,
    [postId, ...visibility.params],
  );
  if (rows.length === 0)
    throw new WeaveError(404, "POST_NOT_FOUND", "Post not found");
  const { type, org_id: orgId, org_unit_id: orgUnitId } = rows[0];
  if (orgId == null || orgUnitId == null || type === "wish") return [];
  return actingUnitsFor(
    dbPool,
    { orgId: Number(orgId), orgUnitId: Number(orgUnitId) },
    userId,
  );
}

/**
 * 建立 Weave 請求：驗證 → 寫入 DB → 發通知 → 建立對話系統訊息
 */
export async function requestWeave(
  params: RequestWeaveParams,
  io: Server | null,
): Promise<RequestWeaveResult> {
  const { postId, items, notes, initiator, actingUnitId } = params;

  const post = await validatePost(postId, initiator.id);
  await validateItems(items, postId);

  const { user_id: postOwnerId, type: postType } = post;
  const isWish = postType === "wish";
  // ADR 0004：組織物品（只會是 Share）流向申請人，記下他代表的單位；個人貼文一律 NULL
  const receiverOrgUnitId =
    post.org_id !== null && post.org_unit_id !== null && !isWish
      ? resolveActingUnit(
          await actingUnitsFor(
            dbPool,
            { orgId: post.org_id, orgUnitId: post.org_unit_id },
            initiator.id,
          ),
          actingUnitId,
        )
      : resolveActingUnit([], actingUnitId);
  const giverId = isWish ? initiator.id : postOwnerId;
  const receiverId = isWish ? postOwnerId : initiator.id;
  const targetUserId = initiator.id === giverId ? receiverId : giverId;

  // Get conversationId first to store in weaves table
  let conversationId: number | null = null;
  try {
    //* 組織物品開組織對話（#140、ADR 0004）：由經手窗口接收，民眾看到的是組織名義，且不會併進兩人的個人對話
    conversationId = await messageService.getConversationId(
      initiator.id,
      targetUserId,
      post.org_id !== null ? { orgId: post.org_id, orgUserId: postOwnerId } : undefined,
    );
  } catch (e) {
    console.error("[requestWeave] Failed to get conversationId:", e);
  }

  // Write weave + items
  const [result] = await dbPool.execute<ResultSetHeader>(
    `INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, conversation_id, status, notes)
     VALUES (?, ?, ?, ?, ?, 'requested', ?)`,
    [postId, giverId, receiverId, receiverOrgUnitId, conversationId, notes ?? null],
  );
  const weaveId = result.insertId;

  for (const item of items) {
    await dbPool.execute(
      `INSERT INTO weave_items (weave_id, item_id, quantity) VALUES (?, ?, ?)`,
      [weaveId, item.itemId ?? null, item.quantity],
    );
  }

  // Notification & Email
  let notificationSent = false;
  try {
    const [postInfo] = await dbPool.execute<RowDataPacket[]>(
      "SELECT title FROM posts WHERE id = ?",
      [postId],
    );
    const postTitle = (postInfo[0]?.title as string) ?? "Item";
    const items = await getWeaveItemsList(Number(weaveId), postId);

    await notifyWeaveStatusChange({
      io,
      weaveId: Number(weaveId),
      postId,
      recipientId: targetUserId,
      senderId: initiator.id,
      actorName: initiator.name,
      postTitle,
      action: "requested",
      items,
      recipientRole: targetUserId === giverId ? "giver" : "receiver",
    });
    notificationSent = true;
  } catch (e) {
    console.error("🔔 [requestWeave] Notification/Email failed:", e);
  }

  // System message in conversation
  if (conversationId) {
    try {
      const meta = await buildSystemMessageMeta(
        items,
        postId,
        weaveId,
        postType,
        postOwnerId,
      );
      const sysMsg = await messageService.createMessage(
        conversationId,
        initiator.id,
        "Start Weaving",
        undefined,
        "system_start_weaving",
        meta,
      );
      if (io) {
        //* 系統訊息的 metadata 帶發文者 public_id：組織對話依各自的視角遮蔽（#140）
        for (const viewerId of [targetUserId, initiator.id]) {
          const mask = await loadConversationMask(dbPool, viewerId, conversationId);
          const dto = messageService.toMessageDTO(presentMessage(sysMsg, mask), initiator.publicId);
          io.to(`user_${viewerId}`).emit("new_message", { ...dto, conversation_id: conversationId });
        }
      }
    } catch (e) {
      console.error("[requestWeave] System message failed:", e);
    }
  }

  return { weaveId, notificationSent };
}

/**
 * 審核 / 確認 / 取消 Weave：狀態機 → 扣庫存 → 通知 → Socket 廣播
 */
export async function approveWeave(
  params: ApproveWeaveParams,
  io: Server | null,
): Promise<ApproveWeaveResult> {
  const { weaveId, newStatus, userId, actorName } = params;
  const connection = await acquireConnection();
  let weave: WeaveRow;
  let isPartialConfirm = false;

  try {
    await connection.beginTransaction();

    const [weaves] = await connection.execute<WeaveRow[]>(
      `SELECT w.*, p.user_id AS post_author_id, p.org_id AS post_org_id, p.org_unit_id AS post_org_unit_id
       FROM weaves w JOIN posts p ON p.id = w.post_id
       WHERE w.id = ? FOR UPDATE`,
      [weaveId],
    );
    if (weaves.length === 0)
      throw new WeaveError(404, "WEAVE_NOT_FOUND", "Not found");

    weave = weaves[0];
    if (weave.status !== "requested" && weave.status !== "approved")
      throw new WeaveError(400, "WEAVE_CLOSED", "Already closed");

    const isGiver = weave.giver_id === userId;
    const isReceiver = weave.receiver_id === userId;
    const isParty = isGiver || isReceiver;
    // Requested stage is judged by Post Author / Initiator (not Giver / Receiver).
    // The Initiator is the party who is not the Post Author.
    const isPostAuthor = weave.post_author_id === userId;
    const isInitiator = isParty && !isPostAuthor;
    // 組織物品（ADR 0003/0004）：由所屬單位的任一窗口或 Org Admin 審核，不限上架的人；
    // 依現在的 membership 判斷，申請人（Receiver）自己不能審核
    const isOrgPost =
      weave.post_org_id != null && weave.post_org_unit_id != null;
    const canReview = isOrgPost
      ? weave.status === "requested" &&
        !isReceiver &&
        (await canReviewOrgRequest(
          connection,
          {
            orgId: Number(weave.post_org_id),
            orgUnitId: Number(weave.post_org_unit_id),
          },
          userId,
        ))
      : isPostAuthor;
    // 審核以外的動作（撤回、取消、確認交接）只屬於兩造；審核權限在下方狀態機逐一檢查
    const isReviewAction = newStatus === "approved" || newStatus === "declined";
    if (!isParty && !(weave.status === "requested" && isReviewAction))
      throw new WeaveError(403, "FORBIDDEN", "Unauthorized");

    // ── State machine ─────────────────────────────────────────────────────────
    // 組織物品的流轉紀錄（#141）：這次的狀態改變由誰做，與改變同一個交易
    let orgEventAction: OrgWeaveEventAction | null = null;
    if (weave.status === "requested") {
      if (newStatus === "approved") {
        if (!canReview)
          throw new WeaveError(
            403,
            "FORBIDDEN",
            "Only post author can approve",
          );
        await validateItems(
          await getWeaveStockItems(connection, weaveId),
          weave.post_id,
          connection,
        );
        await connection.execute(
          `UPDATE weaves SET status = 'approved' WHERE id = ?`,
          [weaveId],
        );
        orgEventAction = "approved";
      } else if (newStatus === "declined") {
        if (!canReview)
          throw new WeaveError(
            403,
            "FORBIDDEN",
            "Only post author can decline",
          );
        await connection.execute(
          `UPDATE weaves SET status = 'declined' WHERE id = ?`,
          [weaveId],
        );
        orgEventAction = "declined";
      } else if (newStatus === "withdrawn") {
        if (!isInitiator)
          throw new WeaveError(403, "FORBIDDEN", "Only initiator can withdraw");
        await connection.execute(
          `UPDATE weaves SET status = 'withdrawn' WHERE id = ?`,
          [weaveId],
        );
        orgEventAction = "withdrawn";
      } else {
        throw new WeaveError(
          400,
          "INVALID_STATUS_TRANSITION",
          "Invalid status transition",
        );
      }
    } else if (weave.status === "approved") {
      if (newStatus === "cancelled") {
        await connection.execute(
          `UPDATE weaves SET status = 'cancelled' WHERE id = ?`,
          [weaveId],
        );
        orgEventAction = "cancelled";
      } else if (newStatus === "completed") {
        const confirmField = isGiver ? "giver_confirmed" : "receiver_confirmed";
        await connection.execute(
          `UPDATE weaves SET ${confirmField} = 1 WHERE id = ?`,
          [weaveId],
        );
        const [check] = await connection.execute<WeaveRow[]>(
          `SELECT giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
          [weaveId],
        );

        const bothConfirmed =
          Boolean(check[0].giver_confirmed) &&
          Boolean(check[0].receiver_confirmed);

        if (bothConfirmed) {
          await deductInventory(connection, weaveId);
          await connection.execute(
            `UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?`,
            [weaveId],
          );
          orgEventAction = "completed";
        } else {
          // 單邊確認不扣庫存，先做軟檢查提早告知庫存不足
          await validateItems(
            await getWeaveStockItems(connection, weaveId),
            weave.post_id,
            connection,
          );
          isPartialConfirm = true;
          orgEventAction = "confirmed";
        }
      } else {
        throw new WeaveError(
          400,
          "INVALID_STATUS_TRANSITION",
          "Invalid status transition",
        );
      }
    }

    if (isOrgPost && orgEventAction) {
      await recordOrgWeaveEvents(connection, [
        {
          weaveId: Number(weaveId),
          postId: Number(weave.post_id),
          orgId: Number(weave.post_org_id),
          action: orgEventAction,
          actorUserId: userId,
        },
      ]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    // Release before any post-commit dbPool query. Holding this connection
    // while borrowing another deadlocks the pool once concurrent approvals
    // reach connectionLimit (mysql2 queues getConnection with no timeout).
    connection.release();
  }

  // 對方：動作者是 Receiver 就通知 Giver，否則通知 Receiver（不是兩造的審核者站在 Giver 這一側）
  const recipientId =
    weave.receiver_id === userId ? weave.giver_id : weave.receiver_id;

  if (isPartialConfirm) {
    // Partial confirm: broadcast partial state, notify, return
    if (io) {
      try {
        const [latestRows] = await dbPool.execute<RowDataPacket[]>(
          `SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
          [weaveId],
        );
        io.to(`user_${recipientId}`).emit("weave_status_updated", {
          weaveId: Number(weaveId),
          status: (latestRows[0]?.status as string) || "approved",
          giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
          receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
        });
        io.to(`user_${userId}`).emit("weave_status_updated", {
          weaveId: Number(weaveId),
          status: (latestRows[0]?.status as string) || "approved",
          giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
          receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
        });
      } catch (emitErr) {
        console.error("Socket emit failed on partial confirm:", emitErr);
      }
    }

    // 派發單邊確認的通知與 Email（已 commit，失敗只記 log，不回 500）
    try {
      const [details] = await dbPool.execute<RowDataPacket[]>(
        `SELECT p.title FROM posts p WHERE p.id = ?`,
        [weave.post_id],
      );
      const postTitle = (details[0]?.title as string) ?? "Item";
      const items = await getWeaveItemsList(Number(weaveId), weave.post_id);

      notifyWeaveStatusChange({
        io,
        weaveId: Number(weaveId),
        postId: weave.post_id,
        recipientId,
        senderId: userId,
        actorName,
        postTitle,
        action: "confirmed",
        items,
        recipientRole: recipientId === weave.giver_id ? "giver" : "receiver",
      }).catch((err) =>
        console.error("Notification/Email failed on partial confirm:", err),
      );
    } catch (e) {
      console.error("Partial confirm notification lookup failed:", e);
    }

    return { newStatus: "approved", fullyCompleted: false };
  }

  // ── Post-commit: notification + socket broadcast ───────────────────────────
  try {
    const [details] = await dbPool.execute<RowDataPacket[]>(
      `SELECT p.title FROM posts p WHERE p.id = ?`,
      [weave.post_id],
    );
    const postTitle = (details[0]?.title as string) ?? "Item";
    const items = await getWeaveItemsList(Number(weaveId), weave.post_id);

    // 判斷觸發的 Action 類型
    let action: WeaveActionType | null = null;
    if (newStatus === "approved" && weave.status === "requested") {
      action = "approved";
    } else if (newStatus === "declined") {
      action = "declined";
    } else if (newStatus === "withdrawn") {
      action = "withdrawn";
    } else if (newStatus === "cancelled") {
      action = "cancelled";
    } else if (newStatus === "completed") {
      const [statusCheck] = await dbPool.execute<RowDataPacket[]>(
        `SELECT status FROM weaves WHERE id = ?`,
        [weaveId],
      );
      action =
        (statusCheck[0]?.status as string) === "completed"
          ? "completed"
          : "confirmed";
    }

    // 派發通知與 Email
    if (action) {
      // 1. 寄給對方 (Recipient)
      await notifyWeaveStatusChange({
        io,
        weaveId: Number(weaveId),
        postId: weave.post_id,
        recipientId,
        senderId: userId,
        actorName,
        postTitle,
        action,
        items,
        recipientRole: recipientId === weave.giver_id ? "giver" : "receiver",
      });

      // 2. 如果狀態為「完全完成 (completed)」，觸發動作的這一方 (userId) 也必須收到 Completed 通知與 Email
      if (action === "completed") {
        await notifyWeaveStatusChange({
          io,
          weaveId: Number(weaveId),
          postId: weave.post_id,
          recipientId: userId,
          senderId: userId,
          actorName,
          postTitle,
          action: "completed",
          items,
          recipientRole: userId === weave.giver_id ? "giver" : "receiver",
        });
      }
    }

    // Broadcast real-time status update to both parties via Socket
    if (io) {
      const [latestRows] = await dbPool.execute<RowDataPacket[]>(
        `SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
        [weaveId],
      );
      const statusPayload = {
        weaveId: Number(weaveId),
        status: (latestRows[0]?.status as string) || newStatus,
        giver_confirmed: Boolean(latestRows[0]?.giver_confirmed),
        receiver_confirmed: Boolean(latestRows[0]?.receiver_confirmed),
      };
      // 兩造加上動作者（審核者可能不是兩造）
      for (const id of new Set([weave.giver_id, weave.receiver_id, userId])) {
        io.to(`user_${id}`).emit("weave_status_updated", statusPayload);
      }
    }
  } catch (e) {
    console.error("Weave update notification/socket failed:", e);
  }

  // Async stats recalculation (fire-and-forget)
  if (newStatus === "completed") {
    updateUserStats(weave.giver_id.toString()).catch(console.error);
    updateUserStats(weave.receiver_id.toString()).catch(console.error);
  }

  return { newStatus, fullyCompleted: newStatus === "completed" };
}
