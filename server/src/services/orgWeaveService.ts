//* 組織物品的 Weave（#137，PRD 0001 §5.1、ADR 0003、ADR 0004）
//* - 能認領 = 能看到：資格由 weaveService.validatePost 的可見性條件判斷（看不到回 404），這裡不重複
//* - 代表誰：申請人在送出時選「代表某單位」或「我個人」，記在 weaves.receiver_org_unit_id。
//*   可代表的單位 = 申請人在貼文所屬組織負責的單位，扣掉物品自己的單位；沒有可代表的單位就只能是個人，
//*   不出現選項（只有一種身分）。流向單位不由 membership 事後推導，窗口離職或調單位後紀錄不變
//* - 誰能核可：物品所屬單位（posts.org_unit_id）的任一窗口，或該組織的 Org Admin；申請人自己除外。
//*   依「現在」的 membership 判斷：上架的人離開單位後就不能再核可
import type { RowDataPacket } from "mysql2/promise";
import { HttpError } from "../utils/httpError";
import type { OrgUnitRef } from "./orgItemService";
import type { SqlExecutor } from "./postVisibility";

/** 一篇組織貼文的擁有者（posts.org_id／org_unit_id） */
export interface OrgPostOwner {
  orgId: number;
  orgUnitId: number;
}

/**
 * 申請人可代表的單位：在這個組織負責的單位，物品自己的單位除外。
 * 空陣列代表沒有「代表誰」的選項，只能以個人身分申請。
 */
export async function actingUnitsFor(
  db: SqlExecutor,
  owner: OrgPostOwner,
  userId: number,
): Promise<OrgUnitRef[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT u.id, u.name
     FROM org_memberships m
     JOIN org_unit_contacts c ON c.membership_id = m.id
     JOIN org_units u ON u.id = c.org_unit_id
     WHERE m.org_id = ? AND m.user_id = ? AND u.id <> ?
     ORDER BY u.name`,
    [owner.orgId, userId, owner.orgUnitId],
  );
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

/**
 * 申請人送出的「代表誰」→ receiver_org_unit_id。
 * - 沒有選項的人：不能指定單位（null／省略都視為個人）
 * - 有選項的人：必須明確送 null（我個人）或其中一個單位 id；省略代表 client 沒問，回 INVALID_REQUEST，
 *   避免有財產編號的資產被默默記成員工個人帶走（ADR 0004）
 * 選項由 client 依 GET /api/weaves/acting-units 產生，送錯是 client bug（INVALID_REQUEST）
 */
export function resolveActingUnit(
  units: readonly OrgUnitRef[],
  requested: number | null | undefined,
): number | null {
  if (units.length === 0) {
    if (requested === undefined || requested === null) return null;
    throw new HttpError(400, "INVALID_REQUEST", "You cannot request on behalf of a unit");
  }
  if (requested === undefined) {
    throw new HttpError(400, "INVALID_REQUEST", "Choose a unit or yourself");
  }
  if (requested === null) return null;
  if (!units.some((unit) => unit.id === requested)) {
    throw new HttpError(400, "INVALID_REQUEST", "You cannot request on behalf of this unit");
  }
  return requested;
}

/**
 * 能否核可／婉拒這篇組織貼文的申請：所屬單位的窗口、Org Admin，或 Platform Admin（ADR 0003，
 * 在每個組織都等同 Org Admin）；申請人本人由呼叫端排除
 */
export async function canReviewOrgRequest(
  db: SqlExecutor,
  owner: OrgPostOwner,
  userId: number,
): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM org_memberships m
     WHERE m.org_id = ? AND m.user_id = ?
       AND (m.org_role = 'admin'
            OR EXISTS (SELECT 1 FROM org_unit_contacts c
                       WHERE c.membership_id = m.id AND c.org_unit_id = ?))
     UNION ALL
     SELECT 1 FROM users u WHERE u.id = ? AND u.role = 'admin'
     LIMIT 1`,
    [owner.orgId, userId, owner.orgUnitId, userId],
  );
  return rows.length > 0;
}

/** 能審核這個單位物品申請的人：所屬單位的所有窗口與該組織的所有 Org Admin（新申請通知所有人） */
export async function orgReviewerIds(db: SqlExecutor, owner: OrgPostOwner): Promise<number[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT m.user_id FROM org_memberships m
     WHERE m.org_id = ?
       AND (m.org_role = 'admin'
            OR EXISTS (SELECT 1 FROM org_unit_contacts c
                       WHERE c.membership_id = m.id AND c.org_unit_id = ?))
     ORDER BY m.user_id`,
    [owner.orgId, owner.orgUnitId],
  );
  return rows.map((row) => Number(row.user_id));
}
