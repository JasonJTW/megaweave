//* 升到 Public 的待公開期（#140，PRD 0001 §5.1 E2-7、E4-2；ADR 0003）
//* - 只有 Org Admin 能送出；有財產編號的物品要確認「已完成報廢／處分程序」（ORG_ASSET_DISPOSAL_UNCONFIRMED）
//* - 送出後 10 分鐘內維持原層級：不進 Feed／排行、不發通知，可一鍵取消（留下 cancelled 紀錄）
//* - 時間到由排程 runPendingPublic 經 changePostTier 升到 Public，層級紀錄記在送出的管理員名下
//* - 演示組織（organizations.is_demo）的管理員可跳過，立即公開；一般組織沒有這個選項
//* - 待公開期間不能做其他層級變更（ORG_ITEM_PENDING_PUBLIC），要先取消
//* - 送出時一併填寫公開資訊（地點、到期日、分類、標籤；orgPublicListing），正式公開前再檢查一次：
//*   缺地點或已過期的不公開（ORG_PUBLIC_LISTING_INCOMPLETE）
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { withTransaction } from "../utils/transaction";
import { afterTierChange, changePostTier, TierChangeResult } from "./orgTierService";
import type { AudienceTier } from "./postVisibility";
import { displayNameSql } from "../utils/displayName";
import { tierNotAllowed, unitNotManaged } from "./orgErrors";
import {
  isPublicListingComplete,
  loadPublicListing,
  PublicListing,
  PublicListingInput,
  publicListingIncomplete,
  savePublicListing,
} from "./orgPublicListing";
import { postService } from "./postService";

export const PENDING_PUBLIC_DELAY_MS = 10 * 60 * 1000;

//* 一次排程最多處理的到期物品；沒處理到的下一輪再看
const BATCH_LIMIT = 200;

export type PendingPublicAction = "started" | "cancelled" | "skipped";

/** 呼叫者在組織的身分（orgItemService.OrgAccess 的子集，避免循環 import） */
export interface PendingPublicAccess {
  orgId: number;
  name: string;
  isAdmin: boolean;
  isDemo: boolean;
  manageableUnits: { id: number }[];
}

export function pendingPublicNotPending() {
  return new HttpError(
    409,
    "ORG_PENDING_PUBLIC_NOT_PENDING",
    "The item is not pending public",
  );
}

export function itemPendingPublic() {
  return new HttpError(
    409,
    "ORG_ITEM_PENDING_PUBLIC",
    "Cancel the pending public period before changing the tier",
  );
}

interface PendingRow {
  postId: number;
  orgUnitId: number;
  tier: AudienceTier;
  assetNumber: string | null;
  dueAt: Date | null;
  by: number | null;
  /** 有沒有 org_post_details（待公開狀態存在那裡） */
  hasDetails: boolean;
  /** 公開資訊（orgPublicListing）：正式公開前檢查 */
  locationId: number | null;
  expiresAt: Date | null;
  categoryId: number | null;
}

//* LEFT JOIN：早期資料（或 fixture）可能沒有 org_post_details，層級變更仍要找得到貼文
const LOCK_SQL = `SELECT p.id, p.org_unit_id, p.audience_tier, p.location_id, p.expires_at, p.category_id, d.post_id AS details_post_id, d.asset_number, d.pending_public_due_at, d.pending_public_by
  FROM posts p LEFT JOIN org_post_details d ON d.post_id = p.id
  WHERE p.org_id = ? AND p.public_id = ? AND p.deleted_at IS NULL FOR UPDATE`;

/** 鎖住貼文與待公開狀態；不在這個組織 → 404 */
export async function lockPendingRow(
  connection: PoolConnection,
  orgId: number,
  postPublicId: string,
): Promise<PendingRow> {
  const [rows] = await connection.execute<RowDataPacket[]>(LOCK_SQL, [orgId, postPublicId]);
  if (rows.length === 0) throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
  const row = rows[0];
  return {
    postId: Number(row.id),
    orgUnitId: Number(row.org_unit_id),
    tier: row.audience_tier as AudienceTier,
    assetNumber: row.asset_number ?? null,
    dueAt: row.pending_public_due_at ? new Date(row.pending_public_due_at) : null,
    by: row.pending_public_by == null ? null : Number(row.pending_public_by),
    hasDetails: row.details_post_id != null,
    locationId: row.location_id == null ? null : Number(row.location_id),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    categoryId: row.category_id == null ? null : Number(row.category_id),
  };
}

function assertAdminOf(access: PendingPublicAccess, row: PendingRow) {
  if (!access.manageableUnits.some((u) => u.id === row.orgUnitId)) {
    throw unitNotManaged();
  }
  if (!access.isAdmin) throw tierNotAllowed();
}

async function setPending(
  connection: PoolConnection,
  postId: number,
  pending: { dueAt: Date; by: number } | null,
) {
  await connection.execute(
    "UPDATE org_post_details SET pending_public_due_at = ?, pending_public_by = ? WHERE post_id = ?",
    [pending?.dueAt ?? null, pending?.by ?? null, postId],
  );
}

async function recordEvent(
  connection: PoolConnection,
  event: {
    postId: number;
    orgId: number;
    action: PendingPublicAction;
    assetDisposalConfirmed?: boolean;
    actorUserId: number;
  },
) {
  await connection.execute(
    `INSERT INTO org_pending_public_events (post_id, org_id, action, asset_disposal_confirmed, actor_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      event.postId,
      event.orgId,
      event.action,
      event.assetDisposalConfirmed ? 1 : 0,
      event.actorUserId,
    ],
  );
}

/** 公開確認框預填：目前的公開資訊。只給 Org Admin（與送出待公開同一個權限） */
export async function getPublicListing(
  access: PendingPublicAccess,
  postPublicId: string,
): Promise<PublicListing> {
  return withTransaction(async (connection) => {
    const row = await lockPendingRow(connection, access.orgId, postPublicId);
    assertAdminOf(access, row);
    return loadPublicListing(connection, row.postId);
  });
}

/**
 * Org Admin 送出待公開，同時寫入公開資訊（地點、到期日、分類、標籤）。
 * 已在待公開就不重設時間也不改資訊（重複點擊無害）；已是 Public → 400 INVALID_REQUEST
 */
export async function startPendingPublic(
  access: PendingPublicAccess,
  userId: number,
  postPublicId: string,
  input: { assetDisposalConfirmed: boolean; listing: PublicListingInput },
  now: Date = new Date(),
): Promise<void> {
  const postId = await withTransaction(async (connection): Promise<number | null> => {
    const row = await lockPendingRow(connection, access.orgId, postPublicId);
    assertAdminOf(access, row);
    if (row.tier === "public") {
      throw new HttpError(400, "INVALID_REQUEST", "The item is already public");
    }
    if (row.dueAt) return null;
    //* 待公開狀態存在 org_post_details；沒有那列就無法排程，當作不是組織物品
    if (!row.hasDetails) throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
    if (row.assetNumber && !input.assetDisposalConfirmed) {
      throw new HttpError(
        400,
        "ORG_ASSET_DISPOSAL_UNCONFIRMED",
        "Confirm the disposal of this asset before making it public",
      );
    }
    await savePublicListing(connection, row.postId, input.listing);
    await setPending(connection, row.postId, {
      dueAt: new Date(now.getTime() + PENDING_PUBLIC_DELAY_MS),
      by: userId,
    });
    await recordEvent(connection, {
      postId: row.postId,
      orgId: access.orgId,
      action: "started",
      assetDisposalConfirmed: row.assetNumber !== null && input.assetDisposalConfirmed,
      actorUserId: userId,
    });
    return row.postId;
  });
  if (postId === null) return;
  //* 分類、標籤、地點都進語意向量（generatePostText），改了要重建；失敗只記 log，待公開已生效
  await postService
    .enqueueEmbeddingForPost(postId)
    .catch((error) => console.error(`Embedding re-enqueue failed for post #${postId}:`, error));
}

/** 取消待公開：維持原層級並留下紀錄。已經公開（或沒有待公開）→ 409 */
export async function cancelPendingPublic(
  access: PendingPublicAccess,
  userId: number,
  postPublicId: string,
): Promise<void> {
  await withTransaction(async (connection) => {
    const row = await lockPendingRow(connection, access.orgId, postPublicId);
    assertAdminOf(access, row);
    if (!row.dueAt) throw pendingPublicNotPending();
    await setPending(connection, row.postId, null);
    await recordEvent(connection, {
      postId: row.postId,
      orgId: access.orgId,
      action: "cancelled",
      actorUserId: userId,
    });
  });
}

/** 演示組織的管理員跳過待公開期，立即公開 */
export async function skipPendingPublic(
  access: PendingPublicAccess,
  userId: number,
  postPublicId: string,
  io: Server | null,
): Promise<void> {
  const result = await withTransaction(async (connection) => {
    const row = await lockPendingRow(connection, access.orgId, postPublicId);
    assertAdminOf(access, row);
    if (!access.isDemo) {
      throw new HttpError(
        403,
        "ORG_PENDING_PUBLIC_SKIP_NOT_ALLOWED",
        "Only demo organizations can skip the pending period",
      );
    }
    if (!row.dueAt) throw pendingPublicNotPending();
    if (!isPublicListingComplete(row, new Date())) throw publicListingIncomplete();
    await setPending(connection, row.postId, null);
    await recordEvent(connection, {
      postId: row.postId,
      orgId: access.orgId,
      action: "skipped",
      actorUserId: userId,
    });
    return changePostTier(connection, {
      orgId: access.orgId,
      postPublicId,
      toTier: "public",
      actor: { type: "user", userId },
    });
  });
  await afterTierChange(result, { io, actorName: access.name, actorUserId: userId });
}

/** 待公開紀錄的一筆，舊的在前（#141 時間軸） */
export interface PendingPublicEvent {
  action: PendingPublicAction;
  assetDisposalConfirmed: boolean;
  actorName: string;
  createdAt: Date;
}

export async function listPendingPublicEvents(
  db: Pick<PoolConnection, "execute">,
  postId: number,
): Promise<PendingPublicEvent[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT e.action, e.asset_disposal_confirmed, e.created_at,
            ${displayNameSql()} AS actor_name
     FROM org_pending_public_events e
     JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE e.post_id = ?
     ORDER BY e.created_at, e.id`,
    [postId],
  );
  return rows.map((row) => ({
    action: row.action as PendingPublicAction,
    assetDisposalConfirmed: Boolean(Number(row.asset_disposal_confirmed)),
    actorName: String(row.actor_name ?? ""),
    createdAt: new Date(row.created_at),
  }));
}

interface DueRow {
  postId: number;
  postPublicId: string;
  orgId: number;
  orgName: string;
}

/** 鎖住後再判斷一次：取消、刪除或已公開的不動；刪除的清掉待公開狀態 */
async function publishOne(due: DueRow, now: Date): Promise<boolean> {
  const result = await withTransaction(async (connection): Promise<TierChangeResult | null> => {
    let row: PendingRow;
    try {
      row = await lockPendingRow(connection, due.orgId, due.postPublicId);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 404) {
        await setPending(connection, due.postId, null);
        return null;
      }
      throw error;
    }
    if (!row.dueAt || row.by === null || row.dueAt.getTime() > now.getTime()) return null;
    await setPending(connection, row.postId, null);
    if (row.tier === "public") return null;
    //* 待公開期間被改掉（到期日過了、地點被清掉）：不公開，維持原層級，管理員要重新送出
    if (!isPublicListingComplete(row, now)) {
      console.warn(`Pending Public skipped for post #${row.postId}: public listing incomplete`);
      return null;
    }
    return changePostTier(connection, {
      orgId: due.orgId,
      postPublicId: due.postPublicId,
      toTier: "public",
      actor: { type: "user", userId: row.by },
    });
  });
  if (!result) return false;
  //* 升級不會婉拒任何申請；排程沒有 Socket.IO
  await afterTierChange(result, { io: null, actorName: due.orgName, actorUserId: null });
  return true;
}

/**
 * 排程（每分鐘）：把待公開期已到的物品升到 Public。每件各自一個交易，一件失敗不影響其他件。
 * @param now 判斷用的時間；排程傳入現在時間
 */
export async function runPendingPublic(now: Date = new Date()): Promise<{ published: number }> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT p.id, p.public_id, p.org_id, o.name AS org_name
     FROM org_post_details d
     JOIN posts p ON p.id = d.post_id
     JOIN organizations o ON o.id = p.org_id
     WHERE d.pending_public_due_at IS NOT NULL AND d.pending_public_due_at <= ?
     ORDER BY d.pending_public_due_at, p.id LIMIT ${BATCH_LIMIT}`,
    [now],
  );
  let published = 0;
  for (const row of rows) {
    const due: DueRow = {
      postId: Number(row.id),
      postPublicId: String(row.public_id),
      orgId: Number(row.org_id),
      orgName: String(row.org_name),
    };
    try {
      if (await publishOne(due, now)) published++;
    } catch (error) {
      console.error(`Pending Public failed for post #${due.postId}:`, error);
    }
  }
  return { published };
}
