//* 組織物品的層級變更與層級紀錄（#138，PRD 0001 §5.1 E2-2、E2-6；ADR 0003）
//* - 所有改 posts.audience_tier 的路徑（手動升降、#139 自動升級、#140 公開）都走 changePostTier：
//*   同一個交易裡改層級、寫 org_post_tier_events、婉拒看不到新層級的人的 Requested 請求
//* - 有 Approved／Completed 的 Weave 時不能降級（ORG_TIER_DEMOTION_BLOCKED）；升級不受影響
//* - commit 之後呼叫 afterTierChange：向量索引的 scope 對齊 MySQL（syncPostVectorScope）、通知被婉拒的人
//* - 誰能改成哪一層由呼叫端判斷（orgItemService.changeItemTier）；這裡只管狀態與紀錄
import type { Server } from "socket.io";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { getVectorRedisClient } from "../utils/redis";
import { notifyWeavesAutoDeclined } from "../utils/weaveService";
import { syncPostVectorScope } from "./postVectorScope";
import {
  AUDIENCE_TIERS,
  AudienceTier,
  loadViewerScope,
  SqlExecutor,
  ViewerScope,
} from "./postVisibility";

/** 誰改的：使用者，或系統（#139 自動升級） */
export type TierActor = { type: "user"; userId: number } | { type: "system" };

export interface TierChangeResult {
  postId: number;
  orgId: number;
  orgUnitId: number;
  fromTier: AudienceTier;
  toTier: AudienceTier;
  /** 因看不到新層級而自動婉拒的請求 */
  declined: { weaveId: number; giverId: number; receiverId: number }[];
}

/** 層級紀錄的一筆；actor.name 在系統操作時為 null */
export interface TierEvent {
  fromTier: AudienceTier;
  toTier: AudienceTier;
  actor: { type: "user" | "system"; name: string | null };
  createdAt: string;
}

export function tierRank(tier: AudienceTier): number {
  return AUDIENCE_TIERS.indexOf(tier);
}

/** 這個可見範圍能否看到某組織某層級的貼文（與 postVisibleIn 同一規則） */
function scopeSeesTier(scope: ViewerScope, orgId: number, tier: AudienceTier): boolean {
  if (tier === "public") return true;
  return scope.orgs.some((o) => o.orgId === orgId && o.tiers.includes(tier));
}

export function demotionBlocked() {
  return new HttpError(
    409,
    "ORG_TIER_DEMOTION_BLOCKED",
    "An approved or completed Weave exists on this item",
  );
}

/**
 * 在呼叫端的交易裡改一篇組織貼文的層級。貼文以 FOR UPDATE 鎖住，避免同時升降或同時核可。
 * 貼文不在這個組織 → 404 POST_NOT_FOUND；層級沒變 → 400 INVALID_REQUEST（畫面過期）。
 */
export async function changePostTier(
  connection: PoolConnection,
  params: {
    orgId: number;
    postPublicId: string;
    toTier: AudienceTier;
    actor: TierActor;
    /** 鎖住貼文後、改動前呼叫；丟錯就不改（權限依鎖住時的層級與單位判斷） */
    authorize?: (post: { fromTier: AudienceTier; orgUnitId: number }) => void;
  },
): Promise<TierChangeResult> {
  const { orgId, postPublicId, toTier, actor, authorize } = params;
  const [posts] = await connection.execute<RowDataPacket[]>(
    `SELECT id, org_id, org_unit_id, audience_tier FROM posts
     WHERE org_id = ? AND public_id = ? AND deleted_at IS NULL FOR UPDATE`,
    [orgId, postPublicId],
  );
  if (posts.length === 0) {
    throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
  }
  const post = posts[0];
  const postId = Number(post.id);
  const fromTier = post.audience_tier as AudienceTier;
  authorize?.({ fromTier, orgUnitId: Number(post.org_unit_id) });
  if (fromTier === toTier) {
    throw new HttpError(400, "INVALID_REQUEST", "The item is already in this tier");
  }

  const isDemotion = tierRank(toTier) < tierRank(fromTier);
  //* 降級：以鎖定讀取取得這篇貼文進行中的 Weave（讀到最新 commit 的狀態並鎖住），
  //* 同時進行的核可要等這裡 commit，之後看到 declined 就回 WEAVE_CLOSED，不會漏過檢查
  const live = isDemotion
    ? (
        await connection.execute<RowDataPacket[]>(
          `SELECT id, status, giver_id, receiver_id FROM weaves
           WHERE post_id = ? AND status IN ('requested', 'approved', 'completed')
           ORDER BY id FOR UPDATE`,
          [postId],
        )
      )[0]
    : [];
  if (live.some((w) => w.status !== "requested")) throw demotionBlocked();

  await connection.execute("UPDATE posts SET audience_tier = ? WHERE id = ?", [toTier, postId]);
  await connection.execute(
    `INSERT INTO org_post_tier_events (post_id, org_id, from_tier, to_tier, actor_type, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [postId, orgId, fromTier, toTier, actor.type, actor.type === "user" ? actor.userId : null],
  );

  //* 看不到新層級的人的 Requested 請求自動婉拒（能認領 = 能看到，ADR 0003）
  const declined: TierChangeResult["declined"] = [];
  for (const weave of live) {
    const scope = await loadViewerScope(connection, Number(weave.receiver_id));
    if (scopeSeesTier(scope, orgId, toTier)) continue;
    declined.push({
      weaveId: Number(weave.id),
      giverId: Number(weave.giver_id),
      receiverId: Number(weave.receiver_id),
    });
  }
  if (declined.length > 0) {
    //* IN (?) 需要 query() 展開陣列
    await connection.query(
      "UPDATE weaves SET status = 'declined' WHERE id IN (?) AND status = 'requested'",
      [declined.map((d) => d.weaveId)],
    );
  }

  return {
    postId,
    orgId,
    orgUnitId: Number(post.org_unit_id),
    fromTier,
    toTier,
    declined,
  };
}

/**
 * commit 之後：向量索引 scope 對齊 MySQL，通知被婉拒的人。失敗只記 log，層級已經生效。
 * @param actorName 通知裡的婉拒者；用組織名稱，不曝光操作者個人（ADR 0004）
 */
export async function afterTierChange(
  result: TierChangeResult,
  options: { io: Server | null; actorName: string; actorUserId: number | null },
): Promise<void> {
  try {
    await syncPostVectorScope(dbPool, getVectorRedisClient(), result.postId);
  } catch (error) {
    console.error("Vector scope sync failed after tier change:", error);
  }
  if (result.declined.length > 0) {
    await notifyWeavesAutoDeclined({
      io: options.io,
      postId: result.postId,
      actorName: options.actorName,
      actorUserId: options.actorUserId,
      weaves: result.declined,
    }).catch((error) => console.error("Auto-decline notification failed:", error));
  }
}

/** 一篇貼文的層級紀錄，舊的在前（#141 時間軸、#143 報表共用） */
export async function listTierEvents(db: SqlExecutor, postId: number): Promise<TierEvent[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT e.from_tier, e.to_tier, e.actor_type, e.created_at,
            COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS actor_name
     FROM org_post_tier_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE e.post_id = ?
     ORDER BY e.created_at, e.id`,
    [postId],
  );
  return rows.map((row) => ({
    fromTier: row.from_tier,
    toTier: row.to_tier,
    actor: {
      type: row.actor_type,
      name: row.actor_name == null ? null : String(row.actor_name),
    },
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
