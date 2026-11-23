//* Weave 生命週期：建立請求、人為轉移（狀態機見 transitions.ts）、系統代為婉拒。
//* 每個操作在一個交易裡改狀態、庫存與組織流轉紀錄，commit 之後才發通知與推播（effects.ts）
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import dbPool from "../../utils/db";
import { acquireConnection } from "../../utils/acquireConnection";
import { messageService } from "../../utils/messageService";
import { withTransaction } from "../../utils/transaction";
import { viewerVisibility } from "../postVisibility";
import { emitNewMessage } from "../orgConversation";
import { actingUnitsFor, orgReviewerIds, resolveActingUnit } from "../orgWeaveService";
import type { OrgUnitRef } from "../orgItemService";
import type { Queryable } from "../orgService";
import { type OrgWeaveEventAction, recordOrgWeaveEvents } from "../orgWeaveEvents";
import {
  announceTransition,
  buildSystemMessageMeta,
  getWeaveItemsList,
  notifyWeaveStatusChange,
  type AutoDeclinedWeave,
} from "./effects";
import {
  assertOnHand,
  deductInventory,
  lockWeaveStock,
  releaseInventory,
  reserveInventory,
  validateItems,
} from "./inventory";
import { rolesOf } from "./roles";
import { decideTransition, SYSTEM_DECLINE, type WeaveCommand } from "./transitions";
import { WeaveError, type WeaveStatus } from "./types";

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
  const { user_id: postOwnerId, type: postType } = post;
  const isWish = postType === "wish";
  //* 組織物品要記下品項與數量、交接時扣庫存，所以不接受「整篇貼文」（沒有指定品項）的申請。
  //* 前端不會送出這種 payload，送了就是 client bug → INVALID_REQUEST
  if (
    post.org_id !== null &&
    !isWish &&
    (items.length === 0 || items.some((item) => !item.itemId || item.quantity < 1))
  ) {
    throw new WeaveError(400, "INVALID_REQUEST", "Org items must be requested by item and quantity");
  }
  await validateItems(items, postId);
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

  //* Weave 與它的 Item 一起寫入：中途失敗不會留下沒有 Item 的 Weave
  const weaveId = await withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, conversation_id, status, notes)
       VALUES (?, ?, ?, ?, ?, 'requested', ?)`,
      [postId, giverId, receiverId, receiverOrgUnitId, conversationId, notes ?? null],
    );
    for (const item of items) {
      await connection.execute(
        `INSERT INTO weave_items (weave_id, item_id, quantity) VALUES (?, ?, ?)`,
        [result.insertId, item.itemId ?? null, item.quantity],
      );
    }
    return result.insertId;
  });

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

    //* 組織物品（#137）：物品屬於單位，單位的其他窗口與 Org Admin 都能審核，一起通知（申請人自己除外）
    if (post.org_id !== null && post.org_unit_id !== null && !isWish) {
      const reviewers = await orgReviewerIds(dbPool, {
        orgId: post.org_id,
        orgUnitId: post.org_unit_id,
      });
      for (const reviewerId of reviewers) {
        if (reviewerId === initiator.id || reviewerId === targetUserId) continue;
        await notifyWeaveStatusChange({
          io,
          weaveId: Number(weaveId),
          postId,
          recipientId: reviewerId,
          senderId: initiator.id,
          actorName: initiator.name,
          postTitle,
          action: "requested",
          items,
          recipientRole: "giver",
          link: "/org/items",
        });
      }
    }
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
        await emitNewMessage(io, dbPool, sysMsg, [targetUserId, initiator.id], initiator.publicId);
      }
    } catch (e) {
      console.error("[requestWeave] System message failed:", e);
    }
  }

  return { weaveId, notificationSent };
}

export interface ActOnWeaveParams {
  weaveId: number;
  /** null：client 要的目標狀態沒有對應的命令（commandForTargetStatus） */
  command: WeaveCommand | null;
  actor: { id: number; name: string };
}

export interface ActOnWeaveResult {
  /** 轉移後的狀態；單方確認時仍是 approved */
  newStatus: WeaveStatus;
  fullyCompleted: boolean;
}

interface LockedWeaveRow extends RowDataPacket {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  /** Joined from posts: the Weave's Post Author (never the Initiator). */
  post_author_id: number;
  post_org_id: number | null;
  post_org_unit_id: number | null;
  status: WeaveStatus;
}

/**
 * 人為轉移：鎖住 Weave → 依轉移表判斷 → 庫存與狀態 → 組織流轉紀錄 → commit → 通知與推播
 */
export async function actOnWeave(
  { weaveId, command, actor }: ActOnWeaveParams,
  io: Server | null,
): Promise<ActOnWeaveResult> {
  const connection = await acquireConnection();
  let weave: LockedWeaveRow;
  let newStatus: WeaveStatus;
  let eventAction: OrgWeaveEventAction;

  try {
    await connection.beginTransaction();

    const [weaves] = await connection.execute<LockedWeaveRow[]>(
      `SELECT w.*, p.user_id AS post_author_id, p.org_id AS post_org_id, p.org_unit_id AS post_org_unit_id
       FROM weaves w JOIN posts p ON p.id = w.post_id
       WHERE w.id = ? FOR UPDATE`,
      [weaveId],
    );
    if (weaves.length === 0) throw new WeaveError(404, "WEAVE_NOT_FOUND", "Not found");
    weave = weaves[0];

    const roles = await rolesOf(
      connection,
      {
        status: weave.status,
        giverId: weave.giver_id,
        receiverId: weave.receiver_id,
        postAuthorId: weave.post_author_id,
        postOrgId: weave.post_org_id,
        postOrgUnitId: weave.post_org_unit_id,
      },
      actor.id,
    );
    const transition = decideTransition(weave.status, roles, command);

    if (transition.command === "confirm") {
      ({ newStatus, eventAction } = await confirmSide(connection, weaveId, roles.isGiver));
    } else {
      if (transition.inventory === "reserve") await reserveInventory(connection, weaveId);
      if (transition.inventory === "release") await releaseInventory(connection, weaveId);
      //* transition.to 來自轉移表的常數，不是 client 輸入
      await connection.execute(`UPDATE weaves SET status = '${transition.to}' WHERE id = ?`, [
        weaveId,
      ]);
      newStatus = transition.to;
      eventAction = transition.to as OrgWeaveEventAction;
    }

    if (weave.post_org_id != null && weave.post_org_unit_id != null) {
      //* 組織物品的流轉紀錄（#141）：這次的狀態改變由誰做，與改變同一個交易
      await recordOrgWeaveEvents(connection, [
        {
          weaveId: Number(weaveId),
          postId: Number(weave.post_id),
          orgId: Number(weave.post_org_id),
          action: eventAction,
          actorUserId: actor.id,
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

  await announceTransition(io, {
    weaveId: Number(weaveId),
    postId: Number(weave.post_id),
    giverId: Number(weave.giver_id),
    receiverId: Number(weave.receiver_id),
    actor,
    status: newStatus,
    action: eventAction,
  });

  return { newStatus, fullyCompleted: newStatus === "completed" };
}

/** 單方確認；雙方都確認才扣庫存並完成，否則先確認手上庫存還夠（核准後庫存可能被改小） */
async function confirmSide(
  connection: PoolConnection,
  weaveId: number,
  isGiver: boolean,
): Promise<{ newStatus: WeaveStatus; eventAction: OrgWeaveEventAction }> {
  const confirmField = isGiver ? "giver_confirmed" : "receiver_confirmed";
  await connection.execute(`UPDATE weaves SET ${confirmField} = 1 WHERE id = ?`, [weaveId]);
  const [check] = await connection.execute<RowDataPacket[]>(
    `SELECT giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?`,
    [weaveId],
  );
  if (Boolean(check[0].giver_confirmed) && Boolean(check[0].receiver_confirmed)) {
    await deductInventory(connection, weaveId);
    await connection.execute(
      `UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [weaveId],
    );
    return { newStatus: "completed", eventAction: "completed" };
  }
  assertOnHand(await lockWeaveStock(connection, weaveId));
  return { newStatus: "approved", eventAction: "confirmed" };
}

/**
 * 系統代 Reviewer 婉拒（CONTEXT.md Declined）：請求者失去資格的 Requested Weave。
 * 在呼叫端的交易裡執行，只改仍是 Requested 的；commit 之後把回傳值交給 announceAutoDeclined
 */
export async function declineAsSystem(
  db: Queryable,
  orgId: number,
  weaves: readonly AutoDeclinedWeave[],
): Promise<AutoDeclinedWeave[]> {
  if (weaves.length === 0) return [];
  //* IN (?) 需要 query() 展開陣列
  await db.query(
    `UPDATE weaves SET status = '${SYSTEM_DECLINE.to}' WHERE id IN (?) AND status = '${SYSTEM_DECLINE.from}'`,
    [weaves.map((w) => w.id)],
  );
  //* 流轉紀錄（#141）：系統婉拒，操作者留空
  await recordOrgWeaveEvents(
    db,
    weaves.map((w) => ({
      weaveId: w.id,
      postId: w.postId,
      orgId,
      action: "declined" as const,
      actorUserId: null,
    })),
  );
  return [...weaves];
}
