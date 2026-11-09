//* 測試用的記憶體 MySQL：在 fakeOrgDb（組織、單位、成員）之上加 posts、org_post_details、items、images，
//* 只認得 orgItemService 送出的語句；其他語句交給 fakeOrgDb，它也不認得就丟錯，避免測試靜默通過
//* 交易：beginTransaction 存快照，rollback 還原
import { createFakeOrgDb, FakeOrgDb, FakeUser } from "./fakeOrgDb";

export interface FakeOrgPostRow {
  id: number;
  public_id: string;
  user_id: number;
  org_id: number;
  org_unit_id: number;
  audience_tier: string;
  title: string;
  content: string;
  status: string;
  type: string;
  category_id: number;
  condition_level: number;
  created_at: Date;
  deleted_at: Date | null;
}

export interface FakeOrgPostDetailRow {
  post_id: number;
  org_category: string;
  quantity: number;
  unit_weight_kg: string; //* mysql2 回傳 DECIMAL 為字串
  weight_is_default: number;
  asset_number: string | null;
  estimated_value_twd: number | null;
  /** 單件 Auto Release 覆寫（#139）；null = 跟組織設定 */
  auto_release_override?: "auto" | "manual" | null;
  auto_release_days?: number | null;
  /** 待公開期（#140） */
  pending_public_due_at?: Date | null;
  pending_public_by?: number | null;
}

export interface FakeItemRow {
  id: number;
  post_id: number;
  title: string;
  quantity: number;
}

export interface FakeImageRow {
  id: number;
  post_id: number;
  s3_key: string;
}

type Result = [unknown, unknown];

interface ItemTables {
  posts: FakeOrgPostRow[];
  details: FakeOrgPostDetailRow[];
  items: FakeItemRow[];
  images: FakeImageRow[];
}

export interface FakeOrgItemsDb extends FakeOrgDb, ItemTables {
  /** 每篇貼文的 Weave 狀態；沒有 weaves 表時為空，由 fakeOrgWeavesDb 換掉 */
  weaveStatusesOf: (postId: number) => string[];
  /** 所有假資料表共用的時鐘：每次呼叫前進 1 秒，跨表的事件才排得出先後 */
  tick: () => Date;
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

//* 後台清單的去向（orgItemService.queryOutcomes）；沒有 weaves 表時是空的，由 fakeOrgWeavesDb 回答
export const OUTCOMES_SQL =
  "SELECT w.id, w.post_id, w.completed_at, w.receiver_org_unit_id, ru.name AS receiver_org_unit_name, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS receiver_name, (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity FROM weaves w JOIN users u ON u.id = w.receiver_id LEFT JOIN user_profiles up ON up.user_id = u.id LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id WHERE w.post_id IN (?) AND w.status = 'completed' ORDER BY w.completed_at, w.id";

const LIST_ITEMS =
  /^SELECT p\.id, p\.public_id, p\.title, p\.type, p\.audience_tier, p\.status, p\.created_at, p\.org_unit_id, u\.name AS unit_name, d\.org_category, d\.quantity, d\.unit_weight_kg, d\.weight_is_default, d\.asset_number, d\.estimated_value_twd, d\.auto_release_override, d\.auto_release_days, d\.pending_public_due_at, \(SELECT GROUP_CONCAT\(i\.s3_key ORDER BY i\.id\) FROM images i WHERE i\.post_id = p\.id\) AS s3_keys, \(SELECT COUNT\(\*\) FROM weaves w WHERE w\.post_id = p\.id AND w\.status = 'requested'\) AS pending_request_count FROM posts p JOIN org_units u ON u\.id = p\.org_unit_id LEFT JOIN org_post_details d ON d\.post_id = p\.id WHERE p\.org_id = \? AND p\.deleted_at IS NULL( AND p\.audience_tier IN \(\?\))?( AND p\.org_unit_id IN \(\?\))?( AND p\.status = \?)?( AND EXISTS \(SELECT 1 FROM weaves w WHERE w\.post_id = p\.id AND w\.status = \?\))?( AND p\.public_id = \?)? ORDER BY p\.created_at DESC, p\.id DESC LIMIT \d+$/;

export function createFakeOrgItemsDb(
  seed: Parameters<typeof createFakeOrgDb>[0] & { users: FakeUser[] },
): FakeOrgItemsDb {
  const base = createFakeOrgDb(seed);
  const tables: ItemTables = { posts: [], details: [], items: [], images: [] };
  let snapshot: ItemTables | null = null;
  let nextPostId = 1000;
  let nextImageId = 1;
  let nextItemId = 500;
  let clock = Date.parse("2026-11-08T00:00:00Z");
  const tick = () => new Date((clock += 1000));

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    const memberships = sql.match(
      /^SELECT o\.id, o\.public_id, o\.name, o\.auto_release_enabled, o\.auto_release_days, o\.is_demo, m\.id AS membership_id, m\.access_level, m\.org_role, u\.role = 'admin' AS is_platform_admin FROM organizations o JOIN users u ON u\.id = \? LEFT JOIN org_memberships m ON m\.org_id = o\.id AND m\.user_id = u\.id WHERE \(m\.id IS NOT NULL OR u\.role = 'admin'\)( AND o\.public_id = \?)? ORDER BY o\.name$/,
    );
    if (memberships) {
      const user = base.users.find((u) => u.id === params[0]);
      const isPlatformAdmin = user?.role === "admin";
      const rows = (user ? base.organizations : [])
        .map((o) => ({
          o,
          m: base.memberships.find((m) => m.user_id === params[0] && m.org_id === o.id),
        }))
        .filter(({ m }) => m || isPlatformAdmin)
        .filter(({ o }) => !memberships[1] || o.public_id === params[1])
        .sort((a, b) => (a.o.name < b.o.name ? -1 : 1))
        .map(({ m, o }) => ({
          id: o.id,
          public_id: o.public_id,
          name: o.name,
          auto_release_enabled: o.auto_release_enabled ? 1 : 0,
          auto_release_days: o.auto_release_days,
          is_demo: o.is_demo ? 1 : 0,
          membership_id: m?.id ?? null,
          access_level: m?.access_level ?? null,
          org_role: m?.org_role ?? null,
          is_platform_admin: isPlatformAdmin ? 1 : 0,
        }));
      return [rows, []];
    }

    if (
      /^SELECT c\.membership_id, u\.id, u\.name FROM org_unit_contacts c JOIN org_units u ON u\.id = c\.org_unit_id WHERE c\.membership_id IN \(\?\) ORDER BY u\.name$/.test(
        sql,
      )
    ) {
      const ids = (params[0] as number[]).map(Number);
      const rows = base.unitContacts
        .filter((c) => ids.includes(c.membership_id))
        .map((c) => ({ c, u: base.units.find((u) => u.id === c.org_unit_id)! }))
        .sort((a, b) => (a.u.name < b.u.name ? -1 : 1))
        .map(({ c, u }) => ({ membership_id: c.membership_id, id: u.id, name: u.name }));
      return [rows, []];
    }

    if (/^SELECT id, name FROM org_units WHERE org_id = \? ORDER BY name$/.test(sql)) {
      const rows = base.units
        .filter((u) => u.org_id === params[0])
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((u) => ({ id: u.id, name: u.name }));
      return [rows, []];
    }

    if (
      /^INSERT INTO posts \(public_id, user_id, org_id, org_unit_id, audience_tier, title, content, status, type, category_id, condition_level, expires_at\) VALUES \(\?, \?, \?, \?, 'internal', \?, \?, 'active', 'share', \?, \?, NULL\)$/.test(
        sql,
      )
    ) {
      const [public_id, user_id, org_id, org_unit_id, title, content, category_id, condition_level] =
        params;
      const unit = base.units.find((u) => u.id === org_unit_id);
      if (unit?.org_id !== org_id) {
        throw new Error("fakeOrgItemsDb: fk_posts_org_unit fails");
      }
      const row: FakeOrgPostRow = {
        id: nextPostId++,
        public_id: String(public_id),
        user_id: Number(user_id),
        org_id: Number(org_id),
        org_unit_id: Number(org_unit_id),
        audience_tier: "internal",
        title: String(title),
        content: String(content),
        status: "active",
        type: "share",
        category_id: Number(category_id),
        condition_level: Number(condition_level),
        created_at: tick(),
        deleted_at: null,
      };
      tables.posts.push(row);
      return [{ insertId: row.id, affectedRows: 1 }, []];
    }

    if (
      /^INSERT INTO org_post_details \(post_id, org_category, quantity, unit_weight_kg, weight_is_default, asset_number, estimated_value_twd\) VALUES \(\?, \?, \?, \?, \?, \?, \?\)$/.test(
        sql,
      )
    ) {
      const [post_id, org_category, quantity, weight, isDefault, asset, value] = params;
      tables.details.push({
        post_id: Number(post_id),
        org_category: String(org_category),
        quantity: Number(quantity),
        unit_weight_kg: Number(weight).toFixed(3),
        weight_is_default: isDefault ? 1 : 0,
        asset_number: (asset as string | null) ?? null,
        estimated_value_twd: (value as number | null) ?? null,
      });
      return [{ affectedRows: 1 }, []];
    }

    if (/^INSERT INTO items \(post_id, title, quantity\) VALUES \(\?, \?, \?\)$/.test(sql)) {
      const [post_id, title, quantity] = params;
      tables.items.push({ id: nextItemId++, post_id: Number(post_id), title: String(title), quantity: Number(quantity) });
      return [{ affectedRows: 1 }, []];
    }

    if (/^INSERT INTO images \(post_id, s3_key, alt_text\) VALUES \?$/.test(sql)) {
      const values = params[0] as [number, string, string][];
      for (const [post_id, s3_key] of values) {
        tables.images.push({ id: nextImageId++, post_id, s3_key });
      }
      return [{ affectedRows: values.length }, []];
    }

    if (sql === OUTCOMES_SQL) return [[], []];

    //* 發文者顯示（#140，orgPublisher）
    if (sql === "SELECT id, name, publisher_display FROM organizations WHERE id IN (?)") {
      const ids = (params[0] as number[]).map(Number);
      const rows = base.organizations
        .filter((o) => ids.includes(o.id))
        .map((o) => ({ id: o.id, name: o.name, publisher_display: o.publisher_display }));
      return [rows, []];
    }
    if (sql === "SELECT id, name FROM org_units WHERE id IN (?)") {
      const ids = (params[0] as number[]).map(Number);
      return [base.units.filter((u) => ids.includes(u.id)).map((u) => ({ id: u.id, name: u.name })), []];
    }
    if (sql === "SELECT 1 FROM org_memberships WHERE org_id = ? AND user_id = ? LIMIT 1") {
      const hit = base.memberships.some(
        (m) => m.org_id === Number(params[0]) && m.user_id === Number(params[1]),
      );
      return [hit ? [{ 1: 1 }] : [], []];
    }
    if (sql === "SELECT org_id FROM org_memberships WHERE user_id = ? AND org_id IN (?)") {
      const ids = (params[1] as number[]).map(Number);
      const rows = base.memberships
        .filter((m) => m.user_id === Number(params[0]) && ids.includes(m.org_id))
        .map((m) => ({ org_id: m.org_id }));
      return [rows, []];
    }
    if (sql === "SELECT org_id, org_unit_id FROM posts WHERE id = ?") {
      const p = tables.posts.find((x) => x.id === Number(params[0]));
      return [p ? [{ org_id: p.org_id, org_unit_id: p.org_unit_id }] : [], []];
    }

    //* 待公開（#140，orgPendingPublicService）
    if (
      sql ===
      "SELECT p.id, p.org_unit_id, p.audience_tier, d.post_id AS details_post_id, d.asset_number, d.pending_public_due_at, d.pending_public_by FROM posts p LEFT JOIN org_post_details d ON d.post_id = p.id WHERE p.org_id = ? AND p.public_id = ? AND p.deleted_at IS NULL FOR UPDATE"
    ) {
      const rows = tables.posts
        .filter((p) => p.org_id === params[0] && p.public_id === params[1] && p.deleted_at === null)
        .map((p) => {
          const d = tables.details.find((x) => x.post_id === p.id);
          return {
            id: p.id,
            org_unit_id: p.org_unit_id,
            audience_tier: p.audience_tier,
            details_post_id: d ? d.post_id : null,
            asset_number: d?.asset_number ?? null,
            pending_public_due_at: d?.pending_public_due_at ?? null,
            pending_public_by: d?.pending_public_by ?? null,
          };
        });
      return [rows, []];
    }

    if (
      sql ===
      "UPDATE org_post_details SET pending_public_due_at = ?, pending_public_by = ? WHERE post_id = ?"
    ) {
      const d = tables.details.find((x) => x.post_id === Number(params[2]));
      if (d) {
        d.pending_public_due_at = (params[0] as Date | null) ?? null;
        d.pending_public_by = params[1] == null ? null : Number(params[1]);
      }
      return [{ affectedRows: d ? 1 : 0 }, []];
    }

    const list = sql.match(LIST_ITEMS);
    if (list) {
      let i = 0;
      const orgId = params[i++];
      const tiers = list[1] ? (params[i++] as string[]) : null;
      const unitIds = list[2] ? (params[i++] as number[]).map(Number) : null;
      const status = list[3] ? params[i++] : null;
      const weaveStatus = list[4] ? params[i++] : null;
      const publicId = list[5] ? params[i++] : null;
      const rows = tables.posts
        .filter(
          (p) =>
            p.org_id === orgId &&
            p.deleted_at === null &&
            (!tiers || tiers.includes(p.audience_tier)) &&
            (!unitIds || unitIds.includes(p.org_unit_id)) &&
            (!status || p.status === status) &&
            (!weaveStatus || db.weaveStatusesOf(p.id).includes(String(weaveStatus))) &&
            (!publicId || p.public_id === publicId),
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
        .map((p) => {
          const d = tables.details.find((x) => x.post_id === p.id);
          const keys = tables.images.filter((img) => img.post_id === p.id).map((img) => img.s3_key);
          return {
            id: p.id,
            public_id: p.public_id,
            title: p.title,
            type: p.type,
            audience_tier: p.audience_tier,
            status: p.status,
            created_at: p.created_at,
            org_unit_id: p.org_unit_id,
            unit_name: base.units.find((u) => u.id === p.org_unit_id)!.name,
            org_category: d?.org_category ?? null,
            quantity: d?.quantity ?? null,
            unit_weight_kg: d?.unit_weight_kg ?? null,
            weight_is_default: d?.weight_is_default ?? null,
            asset_number: d?.asset_number ?? null,
            estimated_value_twd: d?.estimated_value_twd ?? null,
            auto_release_override: d?.auto_release_override ?? null,
            auto_release_days: d?.auto_release_days ?? null,
            pending_public_due_at: d?.pending_public_due_at ?? null,
            s3_keys: keys.length > 0 ? keys.join(",") : null,
            pending_request_count: db.weaveStatusesOf(p.id).filter((s) => s === "requested").length,
          };
        });
      return [rows, []];
    }

    return null;
  }

  const baseConnection = base.connection;
  const db = base as FakeOrgItemsDb;
  db.weaveStatusesOf = () => [];
  db.tick = tick;
  Object.defineProperties(db, {
    posts: { get: () => tables.posts },
    details: { get: () => tables.details },
    items: { get: () => tables.items },
    images: { get: () => tables.images },
  });
  db.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
    beginTransaction: async () => {
      snapshot = {
        posts: tables.posts.map((r) => ({ ...r })),
        details: tables.details.map((r) => ({ ...r })),
        items: tables.items.map((r) => ({ ...r })),
        images: tables.images.map((r) => ({ ...r })),
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
