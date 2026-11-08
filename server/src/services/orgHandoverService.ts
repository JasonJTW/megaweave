//* 人員異動與交接（#142，PRD 0001 §5.1 E8-1、ADR 0003、ADR 0004）
//* - 物品屬於單位（posts.org_unit_id），posts.user_id 只是「現在的經手人」。窗口離職（移除成員）或
//*   異動（不再擔任該單位窗口）後，他經手的物品還在單位，等 Org Admin 交接給同單位另一位窗口
//* - 交接把物品的經手人（posts.user_id）與進行中 Weave 的 Giver（weaves.giver_id）換成新窗口，
//*   Weave 改指向新窗口與申請人的一對一對話（ADR 0004：對話由經手窗口的個人帳號接收）。
//*   已結束的 Weave、原本的對話與訊息都不改；每筆移轉寫一列 org_handover_events，保留原操作者
//* - 移除成員：他送出、移除後已沒資格的 Requested 申請自動婉拒（PRD §5.1）；Approved 的保留到完成
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { messageService } from "../utils/messageService";
import { withTransaction } from "../utils/transaction";
import type { OrgUnitRef } from "./orgItemService";
import type { Queryable } from "./orgService";
import { recordOrgWeaveEvents } from "./orgWeaveEvents";

/** 系統代為婉拒的 Weave（通知申請人、更新兩造畫面用） */
export interface DeclinedWeave {
  id: number;
  postId: number;
  giverId: number;
  receiverId: number;
}

/**
 * 移除成員時，婉拒他在這個組織送出、移除後已沒資格的 Requested 申請：
 * Internal／Members 層的物品（看不到了），以及代表單位送出的申請（不再代表那個單位）。
 * Public 物品上的個人申請保留：一般民眾也能申請。
 * 他經手物品上別人的申請不動，由單位其他窗口或 Org Admin 審核。要在移除成員的交易裡呼叫。
 */
export async function declineRequestsOfRemovedMember(
  db: Queryable,
  orgId: number,
  userId: number,
): Promise<DeclinedWeave[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT w.id, w.post_id, w.giver_id, w.receiver_id
     FROM weaves w JOIN posts p ON p.id = w.post_id
     WHERE p.org_id = ? AND w.receiver_id = ? AND w.status = 'requested'
       AND (p.audience_tier <> 'public' OR w.receiver_org_unit_id IS NOT NULL)
     FOR UPDATE`,
    [orgId, userId],
  );
  const declined = rows.map((row) => ({
    id: Number(row.id),
    postId: Number(row.post_id),
    giverId: Number(row.giver_id),
    receiverId: Number(row.receiver_id),
  }));
  if (declined.length > 0) {
    await db.query(
      "UPDATE weaves SET status = 'declined' WHERE id IN (?) AND status = 'requested'",
      [declined.map((w) => w.id)],
    );
    //* 流轉紀錄（#141）：系統婉拒，操作者留空
    await recordOrgWeaveEvents(
      db,
      declined.map((w) => ({
        weaveId: w.id,
        postId: w.postId,
        orgId,
        action: "declined" as const,
        actorUserId: null,
      })),
    );
  }
  return declined;
}

/** 某人在某單位還經手著、但已不是該單位窗口（也不是 Org Admin）的物品，等著交接 */
export interface PendingHandover {
  /** users.public_id */
  user: { id: string; email: string; isMember: boolean };
  unit: OrgUnitRef;
  itemCount: number;
  /** 他是 Giver、還在 requested／approved 的 Weave */
  openWeaveCount: number;
}

export interface HandoverInput {
  /** 交出的人（users.public_id）：可能已不是成員，所以不用 membership id */
  fromUserId: string;
  unitId: number;
  /** 接手的人：該單位現任窗口的 membership id */
  toMemberId: number;
}

export interface HandoverResult {
  items: number;
  weaves: number;
}

function invalidHandover(message: string): HttpError {
  //* 選項都由 client 從清單帶入，對不上是 client 過期或 bug
  return new HttpError(400, "INVALID_REQUEST", message);
}

export const orgHandoverService = {
  async listPending(orgId: number): Promise<PendingHandover[]> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT u.public_id, u.email, ou.id AS unit_id, ou.name AS unit_name,
         MAX(m.id) IS NOT NULL AS is_member,
         COUNT(DISTINCT p.id) AS item_count,
         COUNT(DISTINCT w.id) AS open_weave_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       JOIN org_units ou ON ou.id = p.org_unit_id
       LEFT JOIN org_memberships m ON m.org_id = p.org_id AND m.user_id = p.user_id
       LEFT JOIN weaves w ON w.post_id = p.id AND w.giver_id = p.user_id AND w.status IN ('requested', 'approved')
       WHERE p.org_id = ? AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM org_memberships cm
           WHERE cm.org_id = p.org_id AND cm.user_id = p.user_id
             AND (cm.org_role = 'admin'
                  OR EXISTS (SELECT 1 FROM org_unit_contacts c
                             WHERE c.membership_id = cm.id AND c.org_unit_id = p.org_unit_id)))
       GROUP BY u.id, u.public_id, u.email, ou.id, ou.name
       ORDER BY ou.name, u.email`,
      [orgId],
    );
    return rows.map((row) => ({
      user: {
        id: String(row.public_id),
        email: String(row.email),
        isMember: Boolean(Number(row.is_member)),
      },
      unit: { id: Number(row.unit_id), name: String(row.unit_name) },
      itemCount: Number(row.item_count),
      openWeaveCount: Number(row.open_weave_count),
    }));
  },

  /**
   * 把 fromUser 在 unitId 經手的物品（未刪除）與他是 Giver 的進行中 Weave 轉給 toMember。
   * toMember 必須是該單位現任窗口；他若是其中某筆進行中 Weave 的申請人，整筆交接擋下
   * （ORG_HANDOVER_TARGET_IS_REQUESTER），否則他會自己給自己。
   * 交易 commit 後才把 Weave 改指向新窗口的對話：對話由 messageService 用另一條連線建立，
   * 在交易裡借第二條連線會在連線池用盡時卡死（見 approveWeave 的註解）。失敗只記 log，conversation_id 本來就可為 NULL。
   */
  async handOver(
    orgId: number,
    input: HandoverInput,
    operatorUserId: number,
  ): Promise<HandoverResult> {
    const moved = await withTransaction(async (connection) => {
      const [targets] = await connection.execute<RowDataPacket[]>(
        `SELECT m.user_id FROM org_memberships m
         JOIN org_unit_contacts c ON c.membership_id = m.id
         WHERE m.org_id = ? AND m.id = ? AND c.org_unit_id = ?
         FOR UPDATE`,
        [orgId, input.toMemberId, input.unitId],
      );
      if (targets.length === 0) {
        throw invalidHandover("The new handler is not a contact of this unit");
      }
      const toUserId = Number(targets[0].user_id);

      const [sources] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE public_id = ?",
        [input.fromUserId],
      );
      if (sources.length === 0) throw invalidHandover("Unknown handler");
      const fromUserId = Number(sources[0].id);
      if (fromUserId === toUserId) {
        throw invalidHandover("Cannot hand over to the same person");
      }

      const [posts] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM posts
         WHERE org_id = ? AND org_unit_id = ? AND user_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [orgId, input.unitId, fromUserId],
      );
      const postIds = posts.map((row) => Number(row.id));
      if (postIds.length === 0) return { toUserId, postIds, weaves: [] };

      const [weaveRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, post_id, receiver_id FROM weaves
         WHERE post_id IN (?) AND giver_id = ? AND status IN ('requested', 'approved')
         FOR UPDATE`,
        [postIds, fromUserId],
      );
      const weaves = weaveRows.map((row) => ({
        id: Number(row.id),
        postId: Number(row.post_id),
        receiverId: Number(row.receiver_id),
      }));
      if (weaves.some((w) => w.receiverId === toUserId)) {
        throw new HttpError(
          409,
          "ORG_HANDOVER_TARGET_IS_REQUESTER",
          "The new handler requested one of these items",
        );
      }

      await connection.query("UPDATE posts SET user_id = ? WHERE id IN (?)", [
        toUserId,
        postIds,
      ]);
      if (weaves.length > 0) {
        await connection.query(
          "UPDATE weaves SET giver_id = ? WHERE id IN (?)",
          [toUserId, weaves.map((w) => w.id)],
        );
      }
      const events = [
        ...postIds.map((postId) => [postId, null]),
        ...weaves.map((w) => [w.postId, w.id]),
      ].map(([postId, weaveId]) => [
        orgId,
        input.unitId,
        postId,
        weaveId,
        fromUserId,
        toUserId,
        operatorUserId,
      ]);
      await connection.query<ResultSetHeader>(
        `INSERT INTO org_handover_events
           (org_id, org_unit_id, post_id, weave_id, from_user_id, to_user_id, operator_user_id)
         VALUES ?`,
        [events],
      );
      return { toUserId, postIds, weaves };
    });

    for (const weave of moved.weaves) {
      try {
        //* 組織對話（#140）：新窗口與申請人的組織對話，民眾看到的仍是組織名義
        const conversationId = await messageService.getConversationId(
          moved.toUserId,
          weave.receiverId,
          { orgId, orgUserId: moved.toUserId },
        );
        //* giver_id 條件：commit 後若又被交接給別人，不蓋掉較新的對話
        await dbPool.execute(
          "UPDATE weaves SET conversation_id = ? WHERE id = ? AND giver_id = ?",
          [conversationId, weave.id, moved.toUserId],
        );
      } catch (error) {
        console.error("[handOver] Failed to move the conversation:", error);
      }
    }

    return { items: moved.postIds.length, weaves: moved.weaves.length };
  },
};
