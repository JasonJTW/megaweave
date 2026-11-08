//* 測試用的記憶體 MySQL：在 fakeOrgWeavesDb 之上加層級變更（posts.audience_tier）與 org_post_tier_events，
//* 只認得 orgTierService 送出的語句；不認得的交給下一層，最底層丟錯
import { createFakeOrgWeavesDb, FakeOrgWeavesDb } from "./fakeOrgWeavesDb";

export interface FakeTierEventRow {
  id: number;
  post_id: number;
  org_id: number;
  from_tier: string;
  to_tier: string;
  actor_type: "user" | "system";
  actor_user_id: number | null;
  created_at: Date;
}

type Result = [unknown, unknown];

export interface FakeOrgTierDb extends FakeOrgWeavesDb {
  tierEvents: FakeTierEventRow[];
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

export function createFakeOrgTierDb(
  seed: Parameters<typeof createFakeOrgWeavesDb>[0],
): FakeOrgTierDb {
  const base = createFakeOrgWeavesDb(seed);
  let tierEvents: FakeTierEventRow[] = [];
  //* posts（含 audience_tier）的還原由 fakeOrgItemsDb 負責，這裡只存事件表
  let snapshot: FakeTierEventRow[] | null = null;
  let nextEventId = 1;

  const postById = (id: unknown) => base.posts.find((p) => p.id === Number(id));

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (
      sql ===
      "SELECT id, org_id, org_unit_id, audience_tier FROM posts WHERE org_id = ? AND public_id = ? AND deleted_at IS NULL FOR UPDATE"
    ) {
      const rows = base.posts
        .filter((p) => p.org_id === params[0] && p.public_id === params[1] && p.deleted_at === null)
        .map((p) => ({
          id: p.id,
          org_id: p.org_id,
          org_unit_id: p.org_unit_id,
          audience_tier: p.audience_tier,
        }));
      return [rows, []];
    }

    if (sql === "UPDATE posts SET audience_tier = ? WHERE id = ?") {
      const post = postById(params[1]);
      if (post) post.audience_tier = String(params[0]);
      return [{ affectedRows: post ? 1 : 0 }, []];
    }

    if (
      sql ===
      "INSERT INTO org_post_tier_events (post_id, org_id, from_tier, to_tier, actor_type, actor_user_id) VALUES (?, ?, ?, ?, ?, ?)"
    ) {
      const [post_id, org_id, from_tier, to_tier, actor_type, actor_user_id] = params;
      tierEvents.push({
        id: nextEventId++,
        post_id: Number(post_id),
        org_id: Number(org_id),
        from_tier: String(from_tier),
        to_tier: String(to_tier),
        actor_type: actor_type as "user" | "system",
        actor_user_id: actor_user_id == null ? null : Number(actor_user_id),
        created_at: base.tick(),
      });
      return [{ insertId: nextEventId - 1, affectedRows: 1 }, []];
    }

    if (
      sql ===
      "SELECT id, status, giver_id, receiver_id FROM weaves WHERE post_id = ? AND status IN ('requested', 'approved', 'completed') ORDER BY id FOR UPDATE"
    ) {
      const rows = base.weaves
        .filter(
          (w) =>
            w.post_id === Number(params[0]) &&
            ["requested", "approved", "completed"].includes(w.status),
        )
        .sort((a, b) => a.id - b.id)
        .map((w) => ({
          id: w.id,
          status: w.status,
          giver_id: w.giver_id,
          receiver_id: w.receiver_id,
        }));
      return [rows, []];
    }

    if (sql === "UPDATE weaves SET status = 'declined' WHERE id IN (?) AND status = 'requested'") {
      const ids = (params[0] as number[]).map(Number);
      let affected = 0;
      for (const w of base.weaves) {
        if (ids.includes(w.id) && w.status === "requested") {
          w.status = "declined";
          affected++;
        }
      }
      return [{ affectedRows: affected }, []];
    }

    if (sql === "SELECT org_id, audience_tier FROM posts WHERE id = ? AND deleted_at IS NULL") {
      const post = postById(params[0]);
      const rows =
        post && post.deleted_at === null
          ? [{ org_id: post.org_id, audience_tier: post.audience_tier }]
          : [];
      return [rows, []];
    }

    if (
      sql ===
      "SELECT e.from_tier, e.to_tier, e.actor_type, e.created_at, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS actor_name FROM org_post_tier_events e LEFT JOIN users u ON u.id = e.actor_user_id LEFT JOIN user_profiles up ON up.user_id = u.id WHERE e.post_id = ? ORDER BY e.created_at, e.id"
    ) {
      const rows = tierEvents
        .filter((e) => e.post_id === Number(params[0]))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
        .map((e) => ({
          from_tier: e.from_tier,
          to_tier: e.to_tier,
          actor_type: e.actor_type,
          created_at: e.created_at,
          //* 假資料的 username 與 signInAs 一致
          actor_name: e.actor_user_id == null ? null : `user-${e.actor_user_id}`,
        }));
      return [rows, []];
    }

    return null;
  }

  const baseConnection = base.connection;
  const db = base as FakeOrgTierDb;
  Object.defineProperty(db, "tierEvents", { get: () => tierEvents });
  db.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
    beginTransaction: async () => {
      snapshot = tierEvents.map((r) => ({ ...r }));
      await baseConnection.beginTransaction();
    },
    commit: async () => {
      snapshot = null;
      await baseConnection.commit();
    },
    rollback: async () => {
      if (snapshot) tierEvents = snapshot;
      snapshot = null;
      await baseConnection.rollback();
    },
  };
  return db;
}
