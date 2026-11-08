//* 物品流轉時間軸（#141，PRD 0001 §5.1 E9-1；ADR 0003、ADR 0004）
//* - 讀的時候從各張 append-only 的紀錄組出來，不另存一份時間軸：posts（上架）、org_post_tier_events（層級）、
//*   org_handover_events（交接）、weaves（申請、領取單位）、org_weave_events（核可、婉拒、交接完成的操作者）
//* - 操作者存的是 user id，名字在讀的時候才查；窗口異動不會改到任何一筆紀錄，所以原操作者一直保留
//* - 上架者：最早一筆物品交接事件的 from_user_id；沒有交接過才用 posts.user_id（那是「現在的經手人」）
//* - 每一步都是 { kind, at, actor, ...細節 }；client 不認得的 kind 也照樣以通用格式顯示
import type { RowDataPacket } from "mysql2/promise";
import type { Queryable } from "./orgService";
import type { OrgUnitRef } from "./orgItemService";
import type { AudienceTier } from "./postVisibility";
import { listTierEvents } from "./orgTierService";
import { listPendingPublicEvents } from "./orgPendingPublicService";
import type { OrgWeaveEventAction } from "./orgWeaveEvents";

/** 操作者：使用者（顯示名稱），或系統（自動升級、自動婉拒） */
export type TimelineActor = { type: "user"; name: string } | { type: "system" };

export interface TimelineEntryBase {
  kind: string;
  at: string;
  actor: TimelineActor | null;
}

export interface ListedEntry extends TimelineEntryBase {
  kind: "listed";
  unit: OrgUnitRef;
  assetNumber: string | null;
}

/** 層級變更（手動、#139 自動升級、#140 公開都寫進 org_post_tier_events） */
export interface TierChangedEntry extends TimelineEntryBase {
  kind: "tier_changed";
  fromTier: AudienceTier;
  toTier: AudienceTier;
}

/** 申請：申請人（經手的個人）與代表的單位（個人申請為 null） */
export interface RequestedEntry extends TimelineEntryBase {
  kind: "requested";
  weaveId: number;
  receiverUnit: OrgUnitRef | null;
  quantity: number;
}

/** 核可、婉拒、撤回、取消、一方確認交接（org_weave_events） */
export interface WeaveStepEntry extends TimelineEntryBase {
  kind: Exclude<OrgWeaveEventAction, "completed">;
  weaveId: number;
}

/** 交接完成：領取的單位或個人 */
export interface CompletedEntry extends TimelineEntryBase {
  kind: "completed";
  weaveId: number;
  receiver: { name: string };
  receiverUnit: OrgUnitRef | null;
  quantity: number;
}

/** 交接：經手人 from → to（weaveId 為 null 是物品本身，有值是那筆進行中 Weave 的 Giver） */
export interface HandedOverEntry extends TimelineEntryBase {
  kind: "handed_over";
  from: { name: string };
  to: { name: string };
  weaveId: number | null;
}

/** 待公開期（#140）：送出（含財產處分確認）、取消、演示組織跳過；正式公開另有 tier_changed */
export interface PendingPublicEntry extends TimelineEntryBase {
  kind: "public_pending_started" | "public_pending_cancelled" | "public_pending_skipped";
  assetDisposalConfirmed: boolean;
}

/** 物品被刪除（軟刪除，紀錄仍在）；沒存誰刪的，操作者為 null */
export interface DeletedEntry extends TimelineEntryBase {
  kind: "deleted";
}

export type TimelineEntry =
  | ListedEntry
  | DeletedEntry
  | HandedOverEntry
  | TierChangedEntry
  | PendingPublicEntry
  | RequestedEntry
  | WeaveStepEntry
  | CompletedEntry;

/** 時間軸要的貼文欄位；含已刪除的貼文（紀錄不因下架或刪除而消失） */
export interface TimelinePost {
  id: number;
  orgUnitId: number;
  handlerId: number;
  createdAt: Date;
  deletedAt: Date | null;
  unitName: string;
  assetNumber: string | null;
}

export async function findTimelinePost(
  db: Queryable,
  orgId: number,
  postPublicId: string,
): Promise<TimelinePost | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT p.id, p.user_id, p.org_unit_id, p.created_at, p.deleted_at,
            u.name AS unit_name, d.asset_number
     FROM posts p
     JOIN org_units u ON u.id = p.org_unit_id
     LEFT JOIN org_post_details d ON d.post_id = p.id
     WHERE p.org_id = ? AND p.public_id = ?`,
    [orgId, postPublicId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    orgUnitId: Number(row.org_unit_id),
    handlerId: Number(row.user_id),
    createdAt: new Date(row.created_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    unitName: String(row.unit_name),
    assetNumber: row.asset_number ?? null,
  };
}

async function userNames(db: Queryable, ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  //* IN (?) 需要 query() 展開陣列
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS name
     FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id IN (?)`,
    [unique],
  );
  return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
}

interface WeaveFacts {
  id: number;
  receiverId: number;
  receiverUnit: OrgUnitRef | null;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  quantity: number;
}

async function loadWeaves(db: Queryable, postId: number): Promise<WeaveFacts[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT w.id, w.receiver_id, w.receiver_org_unit_id, ru.name AS receiver_org_unit_name,
            w.status, w.created_at, w.completed_at,
            (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity
     FROM weaves w
     LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id
     WHERE w.post_id = ?
     ORDER BY w.created_at, w.id`,
    [postId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    receiverId: Number(row.receiver_id),
    receiverUnit:
      row.receiver_org_unit_id == null
        ? null
        : { id: Number(row.receiver_org_unit_id), name: String(row.receiver_org_unit_name) },
    status: String(row.status),
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    quantity: Number(row.quantity),
  }));
}

interface WeaveEventFacts {
  weaveId: number;
  action: OrgWeaveEventAction;
  actorUserId: number | null;
  createdAt: Date;
}

async function loadWeaveEvents(db: Queryable, postId: number): Promise<WeaveEventFacts[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT weave_id, action, actor_user_id, created_at FROM org_weave_events
     WHERE post_id = ? ORDER BY created_at, id`,
    [postId],
  );
  return rows.map((row) => ({
    weaveId: Number(row.weave_id),
    action: row.action,
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    createdAt: new Date(row.created_at),
  }));
}

interface HandoverFacts {
  weaveId: number | null;
  fromUserId: number;
  toUserId: number;
  operatorUserId: number;
  createdAt: Date;
}

async function loadHandovers(db: Queryable, postId: number): Promise<HandoverFacts[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT weave_id, from_user_id, to_user_id, operator_user_id, created_at
     FROM org_handover_events WHERE post_id = ? ORDER BY created_at, id`,
    [postId],
  );
  return rows.map((row) => ({
    weaveId: row.weave_id == null ? null : Number(row.weave_id),
    fromUserId: Number(row.from_user_id),
    toUserId: Number(row.to_user_id),
    operatorUserId: Number(row.operator_user_id),
    createdAt: new Date(row.created_at),
  }));
}

export async function buildTimeline(
  db: Queryable,
  post: TimelinePost,
): Promise<TimelineEntry[]> {
  const handovers = await loadHandovers(db, post.id);
  //* posts.user_id 是現在的經手人；交接過的話，上架的人是第一次物品交接的原經手人
  const listerId =
    handovers.find((h) => h.weaveId === null)?.fromUserId ?? post.handlerId;
  const tierEvents = await listTierEvents(db, post.id);
  const pendingEvents = await listPendingPublicEvents(db, post.id);
  const weaves = await loadWeaves(db, post.id);
  const weaveEvents = await loadWeaveEvents(db, post.id);

  const names = await userNames(db, [
    listerId,
    ...weaves.map((w) => w.receiverId),
    ...handovers.flatMap((h) => [h.fromUserId, h.toUserId, h.operatorUserId]),
    ...weaveEvents.flatMap((e) => (e.actorUserId == null ? [] : [e.actorUserId])),
  ]);
  const nameOf = (id: number) => names.get(id) ?? "";
  const user = (id: number): TimelineActor => ({ type: "user", name: nameOf(id) });
  const actorOf = (id: number | null): TimelineActor =>
    id == null ? { type: "system" } : user(id);
  const weaveById = new Map(weaves.map((w) => [w.id, w]));

  const completedEntry = (
    weave: WeaveFacts,
    at: Date,
    actor: TimelineActor | null,
  ): CompletedEntry => ({
    kind: "completed",
    at: at.toISOString(),
    actor,
    weaveId: weave.id,
    receiver: { name: nameOf(weave.receiverId) },
    receiverUnit: weave.receiverUnit,
    quantity: weave.quantity,
  });

  const entries: TimelineEntry[] = [
    {
      kind: "listed",
      at: post.createdAt.toISOString(),
      actor: user(listerId),
      unit: { id: post.orgUnitId, name: post.unitName },
      assetNumber: post.assetNumber,
    },
    ...tierEvents.map(
      (e): TierChangedEntry => ({
        kind: "tier_changed",
        at: e.createdAt,
        actor:
          e.actor.type === "system"
            ? { type: "system" }
            : { type: "user", name: e.actor.name ?? "" },
        fromTier: e.fromTier,
        toTier: e.toTier,
      }),
    ),
    ...pendingEvents.map(
      (e): PendingPublicEntry => ({
        kind: `public_pending_${e.action}`,
        at: e.createdAt.toISOString(),
        actor: { type: "user", name: e.actorName },
        assetDisposalConfirmed: e.assetDisposalConfirmed,
      }),
    ),
    ...handovers.map(
      (h): HandedOverEntry => ({
        kind: "handed_over",
        at: h.createdAt.toISOString(),
        actor: user(h.operatorUserId),
        from: { name: nameOf(h.fromUserId) },
        to: { name: nameOf(h.toUserId) },
        weaveId: h.weaveId,
      }),
    ),
    ...weaves.map(
      (w): RequestedEntry => ({
        kind: "requested",
        at: w.createdAt.toISOString(),
        actor: user(w.receiverId),
        weaveId: w.id,
        receiverUnit: w.receiverUnit,
        quantity: w.quantity,
      }),
    ),
    ...weaveEvents.flatMap((e): TimelineEntry[] => {
      const weave = weaveById.get(e.weaveId);
      if (!weave) return [];
      if (e.action === "completed") {
        return [completedEntry(weave, e.createdAt, actorOf(e.actorUserId))];
      }
      return [
        {
          kind: e.action,
          at: e.createdAt.toISOString(),
          actor: actorOf(e.actorUserId),
          weaveId: e.weaveId,
        },
      ];
    }),
    //* 這張表之前完成的 Weave 沒有紀錄：仍以 completed_at 顯示完成，操作者不明
    ...weaves
      .filter(
        (w) =>
          w.status === "completed" &&
          w.completedAt &&
          !weaveEvents.some((e) => e.weaveId === w.id && e.action === "completed"),
      )
      .map((w) => completedEntry(w, w.completedAt!, null)),
    ...(post.deletedAt
      ? [{ kind: "deleted" as const, at: post.deletedAt.toISOString(), actor: null }]
      : []),
  ];
  //* 依時間排；同一刻的保持上面組出的順序（Array.prototype.sort 是穩定的）
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
