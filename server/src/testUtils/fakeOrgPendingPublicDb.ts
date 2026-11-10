//* 測試用的記憶體 MySQL：在 fakeOrgTierDb 之上加待公開期（#140）的 org_pending_public_events、
//* 到期清單與熱門排行讀分數的語句；待公開欄位本身（org_post_details）由 fakeOrgItemsDb 負責。
//* 疊在 fakeOrgTimelineDb 之上，時間軸也讀得到待公開紀錄
import { createFakeOrgTimelineDb, FakeOrgTimelineDb, PENDING_EVENTS_SQL } from "./fakeOrgTimelineDb";
import type { FakeOrgTierDb } from "./fakeOrgTierDb";

export interface FakePendingPublicEventRow {
  id: number;
  post_id: number;
  org_id: number;
  action: "started" | "cancelled" | "skipped" | "blocked";
  asset_disposal_confirmed: number;
  actor_user_id: number;
  created_at: Date;
}

type Result = [unknown, unknown];

export interface FakeOrgPendingPublicDb extends FakeOrgTimelineDb {
  pendingEvents: FakePendingPublicEventRow[];
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

export function createFakeOrgPendingPublicDb(
  seed: Parameters<typeof createFakeOrgTimelineDb>[0],
): FakeOrgPendingPublicDb {
  const base: FakeOrgTimelineDb & FakeOrgTierDb = createFakeOrgTimelineDb(seed);
  let events: FakePendingPublicEventRow[] = [];
  let snapshot: FakePendingPublicEventRow[] | null = null;
  let nextId = 1;

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (
      sql ===
      "INSERT INTO org_pending_public_events (post_id, org_id, action, asset_disposal_confirmed, actor_user_id) VALUES (?, ?, ?, ?, ?)"
    ) {
      const [post_id, org_id, action, confirmed, actor] = params;
      events.push({
        id: nextId++,
        post_id: Number(post_id),
        org_id: Number(org_id),
        action: action as FakePendingPublicEventRow["action"],
        asset_disposal_confirmed: Number(confirmed),
        actor_user_id: Number(actor),
        created_at: base.tick(),
      });
      return [{ insertId: nextId - 1, affectedRows: 1 }, []];
    }

    const due = sql.match(
      /^SELECT p\.id, p\.public_id, p\.org_id, o\.name AS org_name FROM org_post_details d JOIN posts p ON p\.id = d\.post_id JOIN organizations o ON o\.id = p\.org_id WHERE d\.pending_public_due_at IS NOT NULL AND d\.pending_public_due_at <= \? ORDER BY d\.pending_public_due_at, p\.id LIMIT \d+$/,
    );
    if (due) {
      const now = (params[0] as Date).getTime();
      const rows = base.details
        .filter((d) => d.pending_public_due_at && d.pending_public_due_at.getTime() <= now)
        .sort((a, b) => a.pending_public_due_at!.getTime() - b.pending_public_due_at!.getTime())
        .map((d) => {
          const p = base.posts.find((x) => x.id === d.post_id)!;
          const o = base.organizations.find((x) => x.id === p.org_id)!;
          return { id: p.id, public_id: p.public_id, org_id: p.org_id, org_name: o.name };
        });
      return [rows, []];
    }

    if (
      sql ===
      "SELECT status, view_count, likes_count, comment_count, created_at FROM posts WHERE id = ? AND deleted_at IS NULL"
    ) {
      const p = base.posts.find((x) => x.id === Number(params[0]) && x.deleted_at === null);
      const rows = p
        ? [{ status: p.status, view_count: 0, likes_count: 0, comment_count: 0, created_at: new Date() }]
        : [];
      return [rows, []];
    }

    if (sql === PENDING_EVENTS_SQL) {
      const rows = events
        .filter((e) => e.post_id === Number(params[0]))
        .map((e) => ({
          action: e.action,
          asset_disposal_confirmed: e.asset_disposal_confirmed,
          created_at: e.created_at,
          actor_name: `user-${e.actor_user_id}`,
        }));
      return [rows, []];
    }

    return null;
  }

  const baseConnection = base.connection;
  const db = base as FakeOrgPendingPublicDb;
  Object.defineProperty(db, "pendingEvents", { get: () => events });
  db.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
    beginTransaction: async () => {
      snapshot = events.map((r) => ({ ...r }));
      await baseConnection.beginTransaction();
    },
    commit: async () => {
      snapshot = null;
      await baseConnection.commit();
    },
    rollback: async () => {
      if (snapshot) events = snapshot;
      snapshot = null;
      await baseConnection.rollback();
    },
  };
  return db;
}
