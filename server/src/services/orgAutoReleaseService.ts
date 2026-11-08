//* Auto Release 自動升級（#139，PRD 0001 §5.1 E2-3；ADR 0003；CONTEXT.md「Auto Release」）
//* - Internal 物品在目前層級「無人申請」累計達設定天數 → 系統升到 Members（changePostTier，actor = system）
//* - 只會 Internal → Members；Public 一律由 Org Admin 手動（#140）
//* - 計時起點：最新一筆 org_post_tier_events.created_at，沒有就是 posts.created_at（上架不算事件，見 #138）
//* - 暫停：申請從送出（weaves.created_at）到結束都不算；Requested／Approved 仍在進行就一直暫停，
//*   所以有 Approved 的 Weave 時不升級。結束時間：completed 用 completed_at，
//*   declined／withdrawn／cancelled 用 updated_at（結束後不再改這列，ON UPDATE 停在結束那一刻）
//* - 設定：單件覆寫（org_post_details.auto_release_override）優先，否則跟組織（organizations.auto_release_*）
//* - 不提供時間快轉或測試用觸發；排程每小時跑一次（queue/queues.ts initOrgAutoReleaseCron）
import type { RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import { withTransaction } from "../utils/transaction";
import { afterTierChange, changePostTier } from "./orgTierService";
import type { Queryable as SqlExecutor } from "./orgService";

export const AUTO_RELEASE_OVERRIDES = ["auto", "manual"] as const;
export type AutoReleaseOverride = (typeof AUTO_RELEASE_OVERRIDES)[number];

/** 天數上限與 Platform Admin 開通組織時相同（admin.ts） */
export const AUTO_RELEASE_MAX_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
//* 一次排程最多處理的候選物品；沒處理到的下一輪再看
const BATCH_LIMIT = 1000;

/** 一筆申請佔用的時間；end 為 null 表示仍在進行（Requested／Approved） */
interface ClaimSpan {
  start: number;
  end: number | null;
}

interface Candidate {
  postId: number;
  postPublicId: string;
  orgId: number;
  orgName: string;
  /** 生效的天數（覆寫優先，否則組織設定）；候選查詢已排除手動 */
  days: number;
  tierEnteredAt: number;
}

const CANDIDATE_SQL = `SELECT p.id, p.public_id, p.org_id, o.name AS org_name,
         o.auto_release_enabled, o.auto_release_days AS org_days,
         d.auto_release_override, d.auto_release_days AS override_days,
         COALESCE((SELECT MAX(e.created_at) FROM org_post_tier_events e WHERE e.post_id = p.id), p.created_at) AS tier_entered_at
  FROM posts p
  JOIN organizations o ON o.id = p.org_id
  LEFT JOIN org_post_details d ON d.post_id = p.id
  WHERE p.audience_tier = 'internal' AND p.status = 'active' AND p.deleted_at IS NULL
    AND (d.auto_release_override = 'auto' OR (d.auto_release_override IS NULL AND o.auto_release_enabled = 1))`;

async function loadCandidates(db: SqlExecutor, postId?: number): Promise<Candidate[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `${CANDIDATE_SQL}${postId === undefined ? "" : " AND p.id = ?"} ORDER BY p.id LIMIT ${BATCH_LIMIT}`,
    postId === undefined ? [] : [postId],
  );
  return rows.map((row) => ({
    postId: Number(row.id),
    postPublicId: String(row.public_id),
    orgId: Number(row.org_id),
    orgName: String(row.org_name),
    days:
      row.auto_release_override === "auto" && row.override_days != null
        ? Number(row.override_days)
        : Number(row.org_days),
    tierEnteredAt: new Date(row.tier_entered_at).getTime(),
  }));
}

function claimEnd(row: RowDataPacket): number | null {
  if (row.status === "requested" || row.status === "approved") return null;
  const end = row.status === "completed" && row.completed_at ? row.completed_at : row.updated_at;
  return new Date(end ?? row.created_at).getTime();
}

async function loadClaims(db: SqlExecutor, postIds: number[]): Promise<Map<number, ClaimSpan[]>> {
  const byPost = new Map<number, ClaimSpan[]>();
  if (postIds.length === 0) return byPost;
  //* IN (?) 需要 query() 展開陣列
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT post_id, status, created_at, updated_at, completed_at FROM weaves WHERE post_id IN (?)",
    [postIds],
  );
  for (const row of rows) {
    const postId = Number(row.post_id);
    const spans = byPost.get(postId) ?? [];
    spans.push({ start: new Date(row.created_at).getTime(), end: claimEnd(row) });
    byPost.set(postId, spans);
  }
  return byPost;
}

/**
 * 從 from 到 now 之間沒有任何申請佔用的時間（毫秒）。
 * 申請區間先截到 [from, now]，再合併重疊的部分，同一段時間只扣一次
 */
function idleTime(from: number, now: number, claims: ClaimSpan[]): number {
  const spans = claims
    .map((c) => [Math.max(c.start, from), Math.min(c.end ?? now, now)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let claimed = 0;
  let cursor = from;
  for (const [start, end] of spans) {
    const s = Math.max(start, cursor);
    if (end > s) {
      claimed += end - s;
      cursor = end;
    }
  }
  return Math.max(0, now - from - claimed);
}

function isDue(candidate: Candidate, claims: ClaimSpan[], now: number): boolean {
  //* 有進行中的申請（Requested／Approved）就不升級
  if (claims.some((c) => c.end === null)) return false;
  return idleTime(candidate.tierEnteredAt, now, claims) >= candidate.days * DAY_MS;
}

/** 鎖住貼文後重讀設定與申請再判斷一次，避免排程讀完到升級之間有人申請或改設定 */
async function releaseOne(candidate: Candidate, now: number): Promise<boolean> {
  const result = await withTransaction(async (connection) => {
    await connection.execute("SELECT id FROM posts WHERE id = ? FOR UPDATE", [candidate.postId]);
    const [fresh] = await loadCandidates(connection, candidate.postId);
    if (!fresh) return null;
    const claims = (await loadClaims(connection, [fresh.postId])).get(fresh.postId) ?? [];
    if (!isDue(fresh, claims, now)) return null;
    return changePostTier(connection, {
      orgId: fresh.orgId,
      postPublicId: fresh.postPublicId,
      toTier: "members",
      actor: { type: "system" },
    });
  });
  if (!result) return false;
  //* 升級不會婉拒任何申請；排程沒有 Socket.IO，通知（若有）只走站內通知與 Email
  await afterTierChange(result, { io: null, actorName: candidate.orgName, actorUserId: null });
  return true;
}

/**
 * 排程：把到期的 Internal 物品升到 Members。每件物品各自一個交易，一件失敗不影響其他件。
 * @param now 判斷用的時間；排程傳入現在時間
 */
export async function runAutoRelease(now: Date = new Date()): Promise<{ checked: number; released: number }> {
  const at = now.getTime();
  const candidates = await loadCandidates(dbPool);
  const claims = await loadClaims(
    dbPool,
    candidates.map((c) => c.postId),
  );
  let released = 0;
  for (const candidate of candidates) {
    if (!isDue(candidate, claims.get(candidate.postId) ?? [], at)) continue;
    try {
      if (await releaseOne(candidate, at)) released++;
    } catch (error) {
      console.error(`Auto Release failed for post #${candidate.postId}:`, error);
    }
  }
  return { checked: candidates.length, released };
}
