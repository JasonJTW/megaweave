//* 測試用的記憶體 MySQL：在 fakeOrgItemsDb（組織、單位、成員、組織貼文、items）之上加 weaves、weave_items，
//* 只認得 weaveService／orgWeaveService／weaves 路由送出的語句；不認得的交給下一層，最底層丟錯
//* 可見性條件用 fakePostVisibility 依綁定參數判斷（與 postVisibleIn 的參數順序相同）
import { createFakeOrgItemsDb, FakeOrgItemsDb, OUTCOMES_SQL } from "./fakeOrgItemsDb";
import { fakePostVisible, MEMBERSHIP_SQL } from "./fakePostVisibility";

export interface FakeWeaveRow {
  id: number;
  post_id: number;
  giver_id: number;
  receiver_id: number;
  receiver_org_unit_id: number | null;
  conversation_id: number | null;
  status: string;
  giver_confirmed: number;
  receiver_confirmed: number;
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
  /** ON UPDATE CURRENT_TIMESTAMP：Auto Release 以它當結束申請的時間（#139） */
  updated_at?: Date;
}

export interface FakeWeaveItemRow {
  id: number;
  weave_id: number;
  item_id: number | null;
  quantity: number;
}

type Result = [unknown, unknown];

/** org_weave_events（#141）：組織物品 Weave 的每次狀態改變與操作者 */
export interface FakeWeaveEventRow {
  id: number;
  weave_id: number;
  post_id: number;
  org_id: number;
  action: string;
  actor_user_id: number | null;
  created_at: Date;
}

interface WeaveTables {
  weaves: FakeWeaveRow[];
  weaveItems: FakeWeaveItemRow[];
  weaveEvents: FakeWeaveEventRow[];
}

export interface FakeOrgWeavesDb extends FakeOrgItemsDb, WeaveTables {}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

export function createFakeOrgWeavesDb(
  seed: Parameters<typeof createFakeOrgItemsDb>[0],
): FakeOrgWeavesDb {
  const base = createFakeOrgItemsDb(seed);
  const tables: WeaveTables = { weaves: [], weaveItems: [], weaveEvents: [] };
  let nextWeaveEventId = 1;
  let snapshot: WeaveTables | null = null;
  let nextWeaveId = 1;
  let nextWeaveItemId = 1;

  const postById = (id: unknown) => base.posts.find((p) => p.id === Number(id));
  const weaveById = (id: unknown) => tables.weaves.find((w) => w.id === Number(id));

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (sql === MEMBERSHIP_SQL) {
      const rows = base.memberships
        .filter((m) => m.user_id === params[0])
        .map((m) => ({ org_id: m.org_id, access_level: m.access_level }));
      //* UNION 段：Platform Admin 在每個組織另有一列 Internal
      if (base.users.some((u) => u.id === params[1] && u.role === "admin")) {
        rows.push(...base.organizations.map((o) => ({ org_id: o.id, access_level: "internal" as const })));
      }
      return [rows, []];
    }

    if (
      sql.startsWith(
        "SELECT p.user_id, p.status, p.type, p.org_id, p.org_unit_id FROM posts p WHERE p.id = ? AND (p.org_id IS NULL OR p.audience_tier = 'public'",
      )
    ) {
      const post = postById(params[0]);
      const visible = post && fakePostVisible(post, params.slice(1));
      const rows = visible
        ? [
            {
              user_id: post.user_id,
              status: post.status,
              type: post.type,
              org_id: post.org_id,
              org_unit_id: post.org_unit_id,
            },
          ]
        : [];
      return [rows, []];
    }

    if (
      sql.startsWith(
        "SELECT p.type, p.org_id, p.org_unit_id FROM posts p WHERE p.id = ? AND p.deleted_at IS NULL AND (p.org_id IS NULL OR p.audience_tier = 'public'",
      )
    ) {
      const post = postById(params[0]);
      const visible =
        post && post.deleted_at === null && fakePostVisible(post, params.slice(1));
      const rows = visible
        ? [{ type: post.type, org_id: post.org_id, org_unit_id: post.org_unit_id }]
        : [];
      return [rows, []];
    }

    if (
      sql ===
      "SELECT u.id, u.name FROM org_memberships m JOIN org_unit_contacts c ON c.membership_id = m.id JOIN org_units u ON u.id = c.org_unit_id WHERE m.org_id = ? AND m.user_id = ? AND u.id <> ? ORDER BY u.name"
    ) {
      const [orgId, userId, excluded] = params;
      const membership = base.memberships.find(
        (m) => m.org_id === orgId && m.user_id === userId,
      );
      const rows = membership
        ? base.unitContacts
            .filter((c) => c.membership_id === membership.id && c.org_unit_id !== excluded)
            .map((c) => base.units.find((u) => u.id === c.org_unit_id)!)
            .sort((a, b) => (a.name < b.name ? -1 : 1))
            .map((u) => ({ id: u.id, name: u.name }))
        : [];
      return [rows, []];
    }

    if (
      sql ===
      "SELECT 1 FROM org_memberships m WHERE m.org_id = ? AND m.user_id = ? AND (m.org_role = 'admin' OR EXISTS (SELECT 1 FROM org_unit_contacts c WHERE c.membership_id = m.id AND c.org_unit_id = ?)) UNION ALL SELECT 1 FROM users u WHERE u.id = ? AND u.role = 'admin' LIMIT 1"
    ) {
      const [orgId, userId, unitId] = params;
      if (base.users.some((u) => u.id === userId && u.role === "admin")) {
        return [[{ 1: 1 }], []];
      }
      const membership = base.memberships.find(
        (m) => m.org_id === orgId && m.user_id === userId,
      );
      const ok =
        membership &&
        (membership.org_role === "admin" ||
          base.unitContacts.some(
            (c) => c.membership_id === membership.id && c.org_unit_id === unitId,
          ));
      return [ok ? [{ 1: 1 }] : [], []];
    }

    if (
      sql ===
      "SELECT m.user_id FROM org_memberships m WHERE m.org_id = ? AND (m.org_role = 'admin' OR EXISTS (SELECT 1 FROM org_unit_contacts c WHERE c.membership_id = m.id AND c.org_unit_id = ?)) ORDER BY m.user_id"
    ) {
      const [orgId, unitId] = params;
      const rows = base.memberships
        .filter(
          (m) =>
            m.org_id === orgId &&
            (m.org_role === "admin" ||
              base.unitContacts.some(
                (c) => c.membership_id === m.id && c.org_unit_id === unitId,
              )),
        )
        .map((m) => ({ user_id: m.user_id }))
        .sort((a, b) => a.user_id - b.user_id);
      return [rows, []];
    }

    //* lockWeaveStock：核准預留、取消釋放、完成扣庫存前先鎖住品項列
    if (/^SELECT id, title, quantity, reserved_quantity FROM items WHERE id IN \((\?, )*\?\) ORDER BY id FOR UPDATE$/.test(sql)) {
      const ids = params.map(Number);
      const rows = base.items
        .filter((i) => ids.includes(i.id))
        .sort((a, b) => a.id - b.id)
        .map((i) => ({
          id: i.id,
          title: i.title,
          quantity: i.quantity,
          reserved_quantity: i.reserved_quantity ?? 0,
        }));
      return [rows, []];
    }

    if (sql === "UPDATE items SET reserved_quantity = reserved_quantity + ? WHERE id = ?") {
      const item = base.items.find((i) => i.id === Number(params[1]));
      if (item) item.reserved_quantity = (item.reserved_quantity ?? 0) + Number(params[0]);
      return [{ affectedRows: item ? 1 : 0 }, []];
    }

    if (sql === "UPDATE items SET reserved_quantity = GREATEST(reserved_quantity - ?, 0) WHERE id = ?") {
      const item = base.items.find((i) => i.id === Number(params[1]));
      if (item) item.reserved_quantity = Math.max((item.reserved_quantity ?? 0) - Number(params[0]), 0);
      return [{ affectedRows: item ? 1 : 0 }, []];
    }

    if (
      sql ===
      "UPDATE items SET quantity = quantity - ?, reserved_quantity = GREATEST(reserved_quantity - ?, 0) WHERE id = ?"
    ) {
      const item = base.items.find((i) => i.id === Number(params[2]));
      if (item) {
        item.quantity -= Number(params[0]);
        item.reserved_quantity = Math.max((item.reserved_quantity ?? 0) - Number(params[1]), 0);
      }
      return [{ affectedRows: item ? 1 : 0 }, []];
    }

    if (sql === "SELECT quantity, reserved_quantity, title FROM items WHERE id = ? AND post_id = ?") {
      const rows = base.items
        .filter((i) => i.id === Number(params[0]) && i.post_id === Number(params[1]))
        .map((i) => ({ quantity: i.quantity, reserved_quantity: i.reserved_quantity ?? 0, title: i.title }));
      return [rows, []];
    }

    if (
      sql ===
      "INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, conversation_id, status, notes) VALUES (?, ?, ?, ?, ?, 'requested', ?)"
    ) {
      const [post_id, giver_id, receiver_id, unitId, conversation_id, notes] = params;
      const row: FakeWeaveRow = {
        id: nextWeaveId++,
        post_id: Number(post_id),
        giver_id: Number(giver_id),
        receiver_id: Number(receiver_id),
        receiver_org_unit_id: unitId == null ? null : Number(unitId),
        conversation_id: (conversation_id as number | null) ?? null,
        status: "requested",
        giver_confirmed: 0,
        receiver_confirmed: 0,
        notes: (notes as string | null) ?? null,
        completed_at: null,
        created_at: base.tick(),
      };
      row.updated_at = row.created_at;
      tables.weaves.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    if (sql === "INSERT INTO weave_items (weave_id, item_id, quantity) VALUES (?, ?, ?)") {
      const [weave_id, item_id, quantity] = params;
      tables.weaveItems.push({
        id: nextWeaveItemId++,
        weave_id: Number(weave_id),
        item_id: item_id == null ? null : Number(item_id),
        quantity: Number(quantity),
      });
      return [{ affectedRows: 1 }, []];
    }

    if (sql === "SELECT title FROM posts WHERE id = ?" || sql === "SELECT p.title FROM posts p WHERE p.id = ?") {
      const post = postById(params[0]);
      return [post ? [{ title: post.title }] : [], []];
    }

    if (sql === "SELECT item_id, quantity FROM weave_items WHERE weave_id = ?") {
      const rows = tables.weaveItems
        .filter((wi) => wi.weave_id === Number(params[0]))
        .map((wi) => ({ item_id: wi.item_id, quantity: wi.quantity }));
      return [rows, []];
    }

    if (sql === "SELECT title FROM items WHERE id = ?") {
      const rows = base.items
        .filter((i) => i.id === Number(params[0]))
        .map((i) => ({ title: i.title }));
      return [rows, []];
    }

    if (
      sql ===
      "SELECT w.*, p.user_id AS post_author_id, p.org_id AS post_org_id, p.org_unit_id AS post_org_unit_id FROM weaves w JOIN posts p ON p.id = w.post_id WHERE w.id = ? FOR UPDATE"
    ) {
      const weave = weaveById(params[0]);
      const post = weave && postById(weave.post_id);
      const rows =
        weave && post
          ? [
              {
                ...weave,
                post_author_id: post.user_id,
                post_org_id: post.org_id,
                post_org_unit_id: post.org_unit_id,
              },
            ]
          : [];
      return [rows, []];
    }

    if (
      sql ===
      "SELECT item_id, SUM(quantity) AS quantity FROM weave_items WHERE weave_id = ? AND item_id IS NOT NULL GROUP BY item_id"
    ) {
      const sums = new Map<number, number>();
      for (const wi of tables.weaveItems) {
        if (wi.weave_id !== Number(params[0]) || wi.item_id === null) continue;
        sums.set(wi.item_id, (sums.get(wi.item_id) ?? 0) + wi.quantity);
      }
      return [[...sums].map(([item_id, quantity]) => ({ item_id, quantity })), []];
    }

    const setStatus = sql.match(/^UPDATE weaves SET status = '(\w+)' WHERE id = \?$/);
    if (setStatus) {
      const weave = weaveById(params[0]);
      if (weave) {
        weave.status = setStatus[1];
        weave.updated_at = base.tick();
      }
      return [{ affectedRows: weave ? 1 : 0 }, []];
    }

    //* 確認交接（approveWeave 的 completed）
    const confirm = sql.match(/^UPDATE weaves SET (giver|receiver)_confirmed = 1 WHERE id = \?$/);
    if (confirm) {
      const weave = weaveById(params[0]);
      if (weave) weave[`${confirm[1] as "giver" | "receiver"}_confirmed`] = 1;
      return [{ affectedRows: weave ? 1 : 0 }, []];
    }

    if (sql === "UPDATE weaves SET status = 'completed', completed_at = NOW() WHERE id = ?") {
      const weave = weaveById(params[0]);
      if (weave) {
        weave.status = "completed";
        weave.completed_at = base.tick();
      }
      return [{ affectedRows: weave ? 1 : 0 }, []];
    }

    if (
      sql === "SELECT giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?" ||
      sql === "SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?" ||
      sql === "SELECT status FROM weaves WHERE id = ?"
    ) {
      const weave = weaveById(params[0]);
      const rows = weave
        ? [
            {
              status: weave.status,
              giver_confirmed: weave.giver_confirmed,
              receiver_confirmed: weave.receiver_confirmed,
            },
          ]
        : [];
      return [rows, []];
    }

    //* weaves.ts 的 WEAVE_QUERY_BASE：只填這張票斷言用得到的欄位
    if (
      sql.startsWith("SELECT w.*, p.id AS post_id_original,") &&
      sql.endsWith("WHERE w.id = ? AND (w.giver_id = ? OR w.receiver_id = ?) GROUP BY w.id")
    ) {
      if (!sql.includes("LEFT JOIN org_units receiver_unit ON receiver_unit.id = w.receiver_org_unit_id")) {
        throw new Error("fakeOrgWeavesDb: WEAVE_QUERY_BASE no longer joins the receiving unit");
      }
      const [weaveId, giverId, receiverId] = params.map(Number);
      const weave = weaveById(weaveId);
      const visible = weave && (weave.giver_id === giverId || weave.receiver_id === receiverId);
      const post = weave && postById(weave.post_id);
      const rows =
        visible && post
          ? [
              {
                ...weave,
                post_id_original: post.id,
                post_public_id: post.public_id,
                post_user_id: post.user_id,
                post_title: post.title,
                post_type: post.type,
                post_org_id: post.org_id,
                post_org_unit_id: post.org_unit_id,
                post_author_public_id: `u-${post.user_id}`,
                post_author_username: `user-${post.user_id}`,
                post_author_avatar: `https://cdn/avatar-${post.user_id}.png`,
                giver_name: `user-${weave.giver_id}`,
                giver_avatar: `https://cdn/avatar-${weave.giver_id}.png`,
                receiver_name: `user-${weave.receiver_id}`,
                receiver_org_unit_name:
                  base.units.find((u) => u.id === weave.receiver_org_unit_id)?.name ?? null,
                s3_keys: null,
              },
            ]
          : [];
      return [rows, []];
    }

    if (
      sql ===
      "SELECT wi.id, wi.weave_id, wi.item_id, wi.quantity, i.title FROM weave_items wi LEFT JOIN items i ON wi.item_id = i.id WHERE wi.weave_id IN (?)"
    ) {
      const ids = (params[0] as number[]).map(Number);
      const rows = tables.weaveItems
        .filter((wi) => ids.includes(wi.weave_id))
        .map((wi) => ({
          ...wi,
          title: base.items.find((i) => i.id === wi.item_id)?.title ?? null,
        }));
      return [rows, []];
    }

    if (
      sql ===
      "SELECT p.id, p.org_unit_id FROM posts p WHERE p.org_id = ? AND p.public_id = ? AND p.deleted_at IS NULL"
    ) {
      const rows = base.posts
        .filter((p) => p.org_id === params[0] && p.public_id === params[1] && p.deleted_at === null)
        .map((p) => ({ id: p.id, org_unit_id: p.org_unit_id }));
      return [rows, []];
    }

    if (
      sql ===
      "SELECT w.id, w.status, w.created_at, w.receiver_org_unit_id, ru.name AS receiver_org_unit_name, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS receiver_name, (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity FROM weaves w JOIN users u ON u.id = w.receiver_id LEFT JOIN user_profiles up ON up.user_id = u.id LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id WHERE w.post_id = ? AND w.status IN ('requested', 'approved', 'completed') ORDER BY w.created_at DESC, w.id DESC"
    ) {
      const rows = tables.weaves
        .filter(
          (w) =>
            w.post_id === Number(params[0]) &&
            ["requested", "approved", "completed"].includes(w.status),
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
        .map((w) => ({
          id: w.id,
          status: w.status,
          created_at: w.created_at,
          receiver_org_unit_id: w.receiver_org_unit_id,
          receiver_org_unit_name:
            base.units.find((u) => u.id === w.receiver_org_unit_id)?.name ?? null,
          //* 假資料的 username 與 signInAs 一致
          receiver_name: `user-${w.receiver_id}`,
          quantity: tables.weaveItems
            .filter((wi) => wi.weave_id === w.id)
            .reduce((sum, wi) => sum + wi.quantity, 0),
        }));
      return [rows, []];
    }

    if (sql === OUTCOMES_SQL) {
      const ids = (params[0] as unknown[]).map(Number);
      const rows = tables.weaves
        .filter((w) => ids.includes(w.post_id) && w.status === "completed")
        .sort((a, b) => a.completed_at!.getTime() - b.completed_at!.getTime() || a.id - b.id)
        .map((w) => ({
          id: w.id,
          post_id: w.post_id,
          completed_at: w.completed_at,
          receiver_org_unit_id: w.receiver_org_unit_id,
          receiver_org_unit_name:
            base.units.find((u) => u.id === w.receiver_org_unit_id)?.name ?? null,
          receiver_name: `user-${w.receiver_id}`,
          quantity: tables.weaveItems
            .filter((wi) => wi.weave_id === w.id)
            .reduce((sum, wi) => sum + wi.quantity, 0),
        }));
      return [rows, []];
    }

    if (
      sql ===
      "INSERT INTO org_weave_events (weave_id, post_id, org_id, action, actor_user_id) VALUES ?"
    ) {
      const rows = params[0] as unknown[][];
      for (const [weave_id, post_id, org_id, action, actor] of rows) {
        tables.weaveEvents.push({
          id: nextWeaveEventId++,
          weave_id: Number(weave_id),
          post_id: Number(post_id),
          org_id: Number(org_id),
          action: String(action),
          actor_user_id: actor == null ? null : Number(actor),
          created_at: base.tick(),
        });
      }
      return [{ affectedRows: rows.length }, []];
    }

    return null;
  }

  const baseConnection = base.connection;
  const db = base as FakeOrgWeavesDb;
  db.weaveStatusesOf = (postId) =>
    tables.weaves.filter((w) => w.post_id === postId).map((w) => w.status);
  Object.defineProperties(db, {
    weaves: { get: () => tables.weaves },
    weaveItems: { get: () => tables.weaveItems },
    weaveEvents: { get: () => tables.weaveEvents },
  });
  db.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
    beginTransaction: async () => {
      snapshot = {
        weaves: tables.weaves.map((r) => ({ ...r })),
        weaveItems: tables.weaveItems.map((r) => ({ ...r })),
        weaveEvents: tables.weaveEvents.map((r) => ({ ...r })),
      };
      await baseConnection.beginTransaction();
    },
    commit: async () => {
      snapshot = null;
      await baseConnection.commit();
    },
    rollback: async () => {
      if (snapshot) Object.assign(tables, snapshot);
      snapshot = null;
      await baseConnection.rollback();
    },
  };
  return db;
}
