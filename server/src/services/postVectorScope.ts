// server/src/services/postVectorScope.ts
// 向量索引 idx:posts_v 的 `scope` TAG（ADR 0003）：每篇貼文的 post:{id} hash 帶一個可見範圍，
// 與 MySQL 的可見性條件（postVisibility.ts）用同一套範圍名稱：
//   - `public`              個人貼文，或 Public 層的組織貼文
//   - `org:<orgId>:<tier>`  Internal／Members 層的組織貼文（例如 `org:12:internal`）
// 公開介面（向量推薦、語意搜尋）的 KNN 先以 `@scope:{public}` 預先過濾，K 筆候選全是公開貼文；
// MySQL 的 publicSurfaceCondition 仍保留，作為第二道防線。
// 少了 scope 欄位的 hash 不會被 `@scope:{public}` 選中：漏寫時是「推薦不到」，不是「洩漏」。

import type { RowDataPacket } from "mysql2/promise";
import type { AudienceTier, SqlExecutor } from "./postVisibility";

export const PUBLIC_VECTOR_SCOPE = "public";

/** 已刪除（或不存在）的貼文：殘留的 hash 標成這個範圍，任何過濾都選不到 */
export const NO_VECTOR_SCOPE = "none";

/** 只需要 hash 的存在檢查與寫入；`getVectorRedisClient()` 符合這個介面 */
export interface VectorScopeRedis {
  exists(key: string): Promise<number>;
  hSet(key: string, fields: Record<string, string>): Promise<number>;
}

export interface PostScopeSource {
  orgId: number | null;
  audienceTier: AudienceTier;
}

export function vectorScopeOf({ orgId, audienceTier }: PostScopeSource): string {
  if (orgId === null || audienceTier === "public") return PUBLIC_VECTOR_SCOPE;
  return `org:${orgId}:${audienceTier}`;
}

/** 公開介面的 KNN 查詢字串：先篩 `scope = public`，再取 K 筆最近鄰（DIALECT 2） */
export function publicKnnQuery(k: number): string {
  return `(@scope:{${PUBLIC_VECTOR_SCOPE}})=>[KNN ${k} @v $vec AS vector_distance]`;
}

function scopeFromRow(row: RowDataPacket): string {
  return vectorScopeOf({
    orgId: row.org_id === null ? null : Number(row.org_id),
    audienceTier: row.audience_tier as AudienceTier,
  });
}

/** 依 MySQL 目前的 org_id／audience_tier 算出貼文的 scope；貼文不存在或已刪除回 null */
export async function loadPostVectorScope(
  db: SqlExecutor,
  postId: number,
): Promise<string | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT org_id, audience_tier FROM posts WHERE id = ? AND deleted_at IS NULL",
    [postId],
  );
  return rows.length > 0 ? scopeFromRow(rows[0]) : null;
}

/**
 * 只改已在索引裡的 hash；還沒產生向量的貼文不建立 hash（之後 postEmbedding job 會自己寫 scope）。
 * @returns 是否有寫入
 */
async function setScopeIfIndexed(
  redis: VectorScopeRedis,
  postId: number,
  scope: string,
): Promise<boolean> {
  const key = `post:${postId}`;
  if (!(await redis.exists(key))) return false;
  await redis.hSet(key, { scope });
  return true;
}

/**
 * 把貼文在向量索引裡的 scope 對齊 MySQL。貼文層級改變（升降層、自動釋出、#138–#140）
 * 在 MySQL 交易 commit 之後呼叫這裡；它重讀 MySQL，所以重送或晚到都不會寫入過時的層級。
 */
export async function syncPostVectorScope(
  db: SqlExecutor,
  redis: VectorScopeRedis,
  postId: number,
): Promise<void> {
  const scope = await loadPostVectorScope(db, postId);
  await setScopeIfIndexed(redis, postId, scope ?? NO_VECTOR_SCOPE);
}

/**
 * 一次性回填：替 Redis 裡既有的 post:* hash 依 MySQL 補上 scope。
 * 以 id 分頁，重跑只會寫入相同的值（冪等）。
 */
export async function backfillPostVectorScopes(
  db: SqlExecutor,
  redis: VectorScopeRedis,
  batchSize = 500,
): Promise<{ scanned: number; updated: number }> {
  const limit = Math.max(1, Math.floor(batchSize));
  let lastId = 0;
  let scanned = 0;
  let updated = 0;
  for (;;) {
    //* LIMIT 是程式內的整數，不是使用者輸入
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, org_id, audience_tier FROM posts WHERE deleted_at IS NULL AND embedding IS NOT NULL AND id > ? ORDER BY id ASC LIMIT ${limit}`,
      [lastId],
    );
    if (rows.length === 0) break;
    const written = await Promise.all(
      rows.map((row) =>
        setScopeIfIndexed(redis, Number(row.id), scopeFromRow(row)),
      ),
    );
    scanned += rows.length;
    updated += written.filter(Boolean).length;
    lastId = Number(rows[rows.length - 1].id);
    if (rows.length < limit) break;
  }
  return { scanned, updated };
}
