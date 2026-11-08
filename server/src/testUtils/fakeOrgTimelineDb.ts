//* 測試用的記憶體 MySQL：物品流轉時間軸（#141）要同時讀層級事件與交接事件，所以疊在
//* fakeOrgHandoverDb（交接）+ fakeOrgTierDb（層級）之上，只認得 orgTimelineService 送出的語句
//* 假資料的顯示名稱是 `user-<id>`（與 fakeOrgTierDb、測試的 signInAs 一致）
import { createFakeOrgHandoverDb, FakeOrgHandoverDb } from "./fakeOrgHandoverDb";
import { createFakeOrgTierDb, FakeOrgTierDb } from "./fakeOrgTierDb";

type Result = [unknown, unknown];

export type FakeOrgTimelineDb = FakeOrgHandoverDb & FakeOrgTierDb;

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

export const TIMELINE_POST_SQL =
  "SELECT p.id, p.user_id, p.org_unit_id, p.created_at, p.deleted_at, u.name AS unit_name, d.asset_number FROM posts p JOIN org_units u ON u.id = p.org_unit_id LEFT JOIN org_post_details d ON d.post_id = p.id WHERE p.org_id = ? AND p.public_id = ?";

const USER_NAMES_SQL =
  "SELECT u.id, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS name FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id IN (?)";

const WEAVES_SQL =
  "SELECT w.id, w.receiver_id, w.receiver_org_unit_id, ru.name AS receiver_org_unit_name, w.status, w.created_at, w.completed_at, (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity FROM weaves w LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id WHERE w.post_id = ? ORDER BY w.created_at, w.id";

const WEAVE_EVENTS_SQL =
  "SELECT weave_id, action, actor_user_id, created_at FROM org_weave_events WHERE post_id = ? ORDER BY created_at, id";

const HANDOVERS_SQL =
  "SELECT weave_id, from_user_id, to_user_id, operator_user_id, created_at FROM org_handover_events WHERE post_id = ? ORDER BY created_at, id";

//* 待公開紀錄（#140）；這一層沒有那張表，回空陣列，由 fakeOrgPendingPublicDb 回答
export const PENDING_EVENTS_SQL =
  "SELECT e.action, e.asset_disposal_confirmed, e.created_at, COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS actor_name FROM org_pending_public_events e JOIN users u ON u.id = e.actor_user_id LEFT JOIN user_profiles up ON up.user_id = u.id WHERE e.post_id = ? ORDER BY e.created_at, e.id";

export function createFakeOrgTimelineDb(
  seed: Parameters<typeof createFakeOrgTierDb>[0],
): FakeOrgTimelineDb {
  const base = createFakeOrgHandoverDb(seed, createFakeOrgTierDb);

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    if (sql === PENDING_EVENTS_SQL) return [[], []];

    if (sql === TIMELINE_POST_SQL) {
      const rows = base.posts
        .filter((p) => p.org_id === params[0] && p.public_id === params[1])
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          org_unit_id: p.org_unit_id,
          created_at: p.created_at,
          deleted_at: p.deleted_at,
          unit_name: base.units.find((u) => u.id === p.org_unit_id)!.name,
          asset_number: base.details.find((d) => d.post_id === p.id)?.asset_number ?? null,
        }));
      return [rows, []];
    }

    if (sql === WEAVES_SQL) {
      const rows = base.weaves
        .filter((w) => w.post_id === Number(params[0]))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
        .map((w) => ({
          id: w.id,
          receiver_id: w.receiver_id,
          receiver_org_unit_id: w.receiver_org_unit_id,
          receiver_org_unit_name:
            base.units.find((u) => u.id === w.receiver_org_unit_id)?.name ?? null,
          status: w.status,
          created_at: w.created_at,
          completed_at: w.completed_at,
          quantity: base.weaveItems
            .filter((wi) => wi.weave_id === w.id)
            .reduce((sum, wi) => sum + wi.quantity, 0),
        }));
      return [rows, []];
    }

    if (sql === WEAVE_EVENTS_SQL) {
      const rows = base.weaveEvents
        .filter((e) => e.post_id === Number(params[0]))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
        .map(({ weave_id, action, actor_user_id, created_at }) => ({
          weave_id,
          action,
          actor_user_id,
          created_at,
        }));
      return [rows, []];
    }

    if (sql === HANDOVERS_SQL) {
      const rows = base.handoverEvents
        .filter((e) => e.post_id === Number(params[0]))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
        .map(({ weave_id, from_user_id, to_user_id, operator_user_id, created_at }) => ({
          weave_id,
          from_user_id,
          to_user_id,
          operator_user_id,
          created_at,
        }));
      return [rows, []];
    }

    if (sql === USER_NAMES_SQL) {
      const ids = (params[0] as unknown[]).map(Number);
      return [ids.map((id) => ({ id, name: `user-${id}` })), []];
    }

    return null;
  }

  const baseConnection = base.connection;
  base.connection = {
    ...baseConnection,
    query: async (sql, params) => run(sql, params) ?? baseConnection.query(sql, params),
    execute: async (sql, params) => run(sql, params) ?? baseConnection.execute(sql, params),
  };
  return base;
}
