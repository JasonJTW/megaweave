//* 測試用的記憶體 MySQL：在 fakeOrgWeavesDb 之上加 org_handover_events，
//* 只認得 orgHandoverService 送出的語句；不認得的交給下一層，最底層丟錯
//* users.public_id：假資料的帳號沒有這欄，一律由 id 推出一個固定的 UUID（publicIdOf）
import { createFakeOrgWeavesDb, FakeOrgWeavesDb } from "./fakeOrgWeavesDb";

export interface FakeHandoverEventRow {
  id: number;
  org_id: number;
  org_unit_id: number;
  post_id: number;
  weave_id: number | null;
  from_user_id: number;
  to_user_id: number;
  operator_user_id: number;
  created_at: Date;
}

type Result = [unknown, unknown];

export interface FakeOrgHandoverDb extends FakeOrgWeavesDb {
  handoverEvents: FakeHandoverEventRow[];
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

export const publicIdOf = (userId: number) =>
  `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`;

const DECLINE_REMOVED_SQL =
  "SELECT w.id, w.post_id, w.giver_id, w.receiver_id FROM weaves w JOIN posts p ON p.id = w.post_id WHERE p.org_id = ? AND w.receiver_id = ? AND w.status = 'requested' AND (p.audience_tier <> 'public' OR w.receiver_org_unit_id IS NOT NULL) FOR UPDATE";

const DECLINE_ON_BEHALF_SQL =
  "SELECT w.id, w.post_id, w.giver_id, w.receiver_id FROM weaves w JOIN posts p ON p.id = w.post_id WHERE p.org_id = ? AND w.receiver_id = ? AND w.status = 'requested' AND w.receiver_org_unit_id IN (?) FOR UPDATE";

const LIST_PENDING_SQL =
  "SELECT u.public_id, u.email, ou.id AS unit_id, ou.name AS unit_name, MAX(m.id) IS NOT NULL AS is_member, COUNT(DISTINCT p.id) AS item_count, COUNT(DISTINCT w.id) AS open_weave_count FROM posts p JOIN users u ON u.id = p.user_id JOIN org_units ou ON ou.id = p.org_unit_id LEFT JOIN org_memberships m ON m.org_id = p.org_id AND m.user_id = p.user_id LEFT JOIN weaves w ON w.post_id = p.id AND w.giver_id = p.user_id AND w.status IN ('requested', 'approved') WHERE p.org_id = ? AND p.deleted_at IS NULL AND u.role <> 'admin' AND NOT EXISTS ( SELECT 1 FROM org_memberships cm WHERE cm.org_id = p.org_id AND cm.user_id = p.user_id AND (cm.org_role = 'admin' OR EXISTS (SELECT 1 FROM org_unit_contacts c WHERE c.membership_id = cm.id AND c.org_unit_id = p.org_unit_id))) GROUP BY u.id, u.public_id, u.email, ou.id, ou.name ORDER BY ou.name, u.email";

const OPEN = ["requested", "approved"];

/** `createBase` 讓別的層（例如 fakeOrgTierDb）墊在下面，一次測交接與層級變更 */
export function createFakeOrgHandoverDb<Base extends FakeOrgWeavesDb = FakeOrgWeavesDb>(
  seed: Parameters<typeof createFakeOrgWeavesDb>[0],
  createBase: (seed: Parameters<typeof createFakeOrgWeavesDb>[0]) => Base = createFakeOrgWeavesDb as never,
): FakeOrgHandoverDb & Base {
  const base = createBase(seed);
  let events: FakeHandoverEventRow[] = [];
  let snapshot: FakeHandoverEventRow[] | null = null;
  let nextEventId = 1;

  const ids = (value: unknown) => (value as unknown[]).map(Number);

  function isContactOrAdmin(userId: number, orgId: number, unitId: number) {
    const membership = base.memberships.find(
      (m) => m.org_id === orgId && m.user_id === userId,
    );
    return (
      !!membership &&
      (membership.org_role === "admin" ||
        base.unitContacts.some(
          (c) => c.membership_id === membership.id && c.org_unit_id === unitId,
        ))
    );
  }

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (sql === DECLINE_REMOVED_SQL) {
      const [orgId, userId] = params;
      const rows = base.weaves
        .filter((w) => {
          const post = base.posts.find((p) => p.id === w.post_id)!;
          return (
            post.org_id === orgId &&
            w.receiver_id === userId &&
            w.status === "requested" &&
            (post.audience_tier !== "public" || w.receiver_org_unit_id !== null)
          );
        })
        .map((w) => ({
          id: w.id,
          post_id: w.post_id,
          giver_id: w.giver_id,
          receiver_id: w.receiver_id,
        }));
      return [rows, []];
    }

    if (sql === DECLINE_ON_BEHALF_SQL) {
      const [orgId, userId, unitIds] = params;
      const units = ids(unitIds);
      const rows = base.weaves
        .filter((w) => {
          const post = base.posts.find((p) => p.id === w.post_id)!;
          return (
            post.org_id === orgId &&
            w.receiver_id === userId &&
            w.status === "requested" &&
            w.receiver_org_unit_id !== null &&
            units.includes(w.receiver_org_unit_id)
          );
        })
        .map((w) => ({
          id: w.id,
          post_id: w.post_id,
          giver_id: w.giver_id,
          receiver_id: w.receiver_id,
        }));
      return [rows, []];
    }

    if (
      sql ===
      "UPDATE weaves SET status = 'declined' WHERE id IN (?) AND status = 'requested'"
    ) {
      const targets = ids(params[0]);
      let affectedRows = 0;
      for (const w of base.weaves) {
        if (targets.includes(w.id) && w.status === "requested") {
          w.status = "declined";
          affectedRows++;
        }
      }
      return [{ affectedRows }, []];
    }

    if (sql === LIST_PENDING_SQL) {
      const orgId = params[0];
      const groups = new Map<string, { userId: number; unitId: number; posts: number[] }>();
      for (const p of base.posts) {
        if (p.org_id !== orgId || p.deleted_at !== null) continue;
        if (isContactOrAdmin(p.user_id, p.org_id, p.org_unit_id)) continue;
        if (base.users.find((u) => u.id === p.user_id)?.role === "admin") continue;
        const key = `${p.user_id}:${p.org_unit_id}`;
        const group = groups.get(key) ?? { userId: p.user_id, unitId: p.org_unit_id, posts: [] };
        group.posts.push(p.id);
        groups.set(key, group);
      }
      const rows = [...groups.values()]
        .map(({ userId, unitId, posts }) => {
          const unit = base.units.find((u) => u.id === unitId)!;
          return {
            public_id: publicIdOf(userId),
            email: base.users.find((u) => u.id === userId)!.email,
            unit_id: unit.id,
            unit_name: unit.name,
            is_member: base.memberships.some(
              (m) => m.org_id === orgId && m.user_id === userId,
            )
              ? 1
              : 0,
            item_count: posts.length,
            open_weave_count: base.weaves.filter(
              (w) =>
                posts.includes(w.post_id) &&
                w.giver_id === userId &&
                OPEN.includes(w.status),
            ).length,
          };
        })
        .sort((a, b) =>
          a.unit_name === b.unit_name
            ? a.email < b.email
              ? -1
              : 1
            : a.unit_name < b.unit_name
              ? -1
              : 1,
        );
      return [rows, []];
    }

    if (
      sql ===
      "SELECT m.user_id FROM org_memberships m JOIN org_unit_contacts c ON c.membership_id = m.id WHERE m.org_id = ? AND m.id = ? AND c.org_unit_id = ? FOR UPDATE"
    ) {
      const [orgId, membershipId, unitId] = params;
      const membership = base.memberships.find(
        (m) => m.org_id === orgId && m.id === Number(membershipId),
      );
      const ok =
        membership &&
        base.unitContacts.some(
          (c) => c.membership_id === membership.id && c.org_unit_id === Number(unitId),
        );
      return [ok ? [{ user_id: membership.user_id }] : [], []];
    }

    if (sql === "SELECT id FROM users WHERE public_id = ?") {
      const user = base.users.find((u) => publicIdOf(u.id) === params[0]);
      return [user ? [{ id: user.id }] : [], []];
    }

    if (
      sql ===
      "SELECT id, title FROM posts WHERE org_id = ? AND org_unit_id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE"
    ) {
      const [orgId, unitId, userId] = params;
      const rows = base.posts
        .filter(
          (p) =>
            p.org_id === orgId &&
            p.org_unit_id === Number(unitId) &&
            p.user_id === userId &&
            p.deleted_at === null,
        )
        .map((p) => ({ id: p.id, title: p.title }));
      return [rows, []];
    }

    if (
      sql ===
      "SELECT id, post_id, receiver_id, conversation_id FROM weaves WHERE post_id IN (?) AND giver_id = ? AND status IN ('requested', 'approved') FOR UPDATE"
    ) {
      const postIds = ids(params[0]);
      const rows = base.weaves
        .filter(
          (w) =>
            postIds.includes(w.post_id) &&
            w.giver_id === params[1] &&
            OPEN.includes(w.status),
        )
        .map((w) => ({
          id: w.id,
          post_id: w.post_id,
          receiver_id: w.receiver_id,
          conversation_id: w.conversation_id ?? null,
        }));
      return [rows, []];
    }

    if (sql === "UPDATE posts SET user_id = ? WHERE id IN (?)") {
      const postIds = ids(params[1]);
      const posts = base.posts.filter((p) => postIds.includes(p.id));
      for (const p of posts) p.user_id = Number(params[0]);
      return [{ affectedRows: posts.length }, []];
    }

    if (sql === "UPDATE weaves SET giver_id = ? WHERE id IN (?)") {
      const weaveIds = ids(params[1]);
      const weaves = base.weaves.filter((w) => weaveIds.includes(w.id));
      for (const w of weaves) w.giver_id = Number(params[0]);
      return [{ affectedRows: weaves.length }, []];
    }

    if (
      sql ===
      "INSERT INTO org_handover_events (org_id, org_unit_id, post_id, weave_id, from_user_id, to_user_id, operator_user_id) VALUES ?"
    ) {
      const rows = params[0] as unknown[][];
      for (const [org_id, org_unit_id, post_id, weave_id, from, to, operator] of rows) {
        events.push({
          id: nextEventId++,
          org_id: Number(org_id),
          org_unit_id: Number(org_unit_id),
          post_id: Number(post_id),
          weave_id: weave_id == null ? null : Number(weave_id),
          from_user_id: Number(from),
          to_user_id: Number(to),
          operator_user_id: Number(operator),
          created_at: base.tick(),
        });
      }
      return [{ affectedRows: rows.length }, []];
    }

    if (sql === "UPDATE weaves SET conversation_id = ? WHERE id = ?") {
      const [conversationId, weaveId] = params;
      const weave = base.weaves.find((w) => w.id === Number(weaveId));
      if (weave) weave.conversation_id = Number(conversationId);
      return [{ affectedRows: weave ? 1 : 0 }, []];
    }

    //* 對話的組織脈絡：假資料不存對話，一律當成個人對話（不遮蔽；遮蔽另有測試）
    if (sql === "SELECT id, org_id, org_user_id FROM conversations WHERE id = ?") {
      return [[], []];
    }

    if (sql === "SELECT name FROM org_units WHERE id = ?") {
      const unit = base.units.find((u) => u.id === Number(params[0]));
      return [unit ? [{ name: unit.name }] : [], []];
    }

    return null;
  }

  const baseConnection = base.connection;
  const db = base as FakeOrgHandoverDb & Base;
  Object.defineProperty(db, "handoverEvents", { get: () => events });
  db.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
    beginTransaction: async () => {
      snapshot = events.map((e) => ({ ...e }));
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
