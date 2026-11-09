//* 測試用的記憶體 MySQL：在 fakeOrgTierDb 之上加組織報表（orgReportService）的三個唯讀查詢；
//* 不認得的語句交給下一層，最底層丟錯
import { createFakeOrgTierDb, FakeOrgTierDb } from "./fakeOrgTierDb";

type Result = [unknown, unknown];

export type FakeOrgReportDb = FakeOrgTierDb;

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

const REPORT_POSTS =
  "SELECT p.id, p.org_unit_id, d.org_category, d.quantity, d.unit_weight_kg, d.weight_is_default, d.estimated_value_twd, (p.deleted_at IS NULL AND p.status = 'active') AS on_shelf, (SELECT SUM(i.quantity) FROM items i WHERE i.post_id = p.id) AS stock_quantity FROM posts p LEFT JOIN org_post_details d ON d.post_id = p.id WHERE p.org_id = ? AND (p.deleted_at IS NULL OR EXISTS (SELECT 1 FROM weaves w WHERE w.post_id = p.id AND w.status = 'completed'))";
const REPORT_WEAVES =
  "SELECT w.id, w.post_id, w.created_at, w.receiver_org_unit_id, COALESCE(SUM(wi.quantity), 0) AS quantity FROM weaves w JOIN posts p ON p.id = w.post_id LEFT JOIN weave_items wi ON wi.weave_id = w.id WHERE p.org_id = ? AND w.status = 'completed' GROUP BY w.id, w.post_id, w.created_at, w.receiver_org_unit_id";
const REPORT_TIER_EVENTS =
  "SELECT post_id, to_tier, created_at FROM org_post_tier_events WHERE org_id = ? ORDER BY created_at, id";

export function createFakeOrgReportDb(
  seed: Parameters<typeof createFakeOrgTierDb>[0],
): FakeOrgReportDb {
  const base = createFakeOrgTierDb(seed);

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const orgId = Number(((rawParams ?? []) as unknown[])[0]);

    if (sql === REPORT_POSTS) {
      const completed = (postId: number) =>
        base.weaves.some((w) => w.post_id === postId && w.status === "completed");
      const rows = base.posts
        .filter((p) => p.org_id === orgId && (p.deleted_at === null || completed(p.id)))
        .map((p) => {
          const d = base.details.find((x) => x.post_id === p.id);
          return {
            id: p.id,
            org_unit_id: p.org_unit_id,
            org_category: d?.org_category ?? null,
            quantity: d?.quantity ?? null,
            unit_weight_kg: d?.unit_weight_kg ?? null,
            weight_is_default: d?.weight_is_default ?? null,
            estimated_value_twd: d?.estimated_value_twd ?? null,
            on_shelf: p.deleted_at === null && p.status === "active" ? 1 : 0,
            stock_quantity: base.items.some((i) => i.post_id === p.id)
              ? base.items.filter((i) => i.post_id === p.id).reduce((sum, i) => sum + i.quantity, 0)
              : null,
          };
        });
      return [rows, []];
    }

    if (sql === REPORT_WEAVES) {
      const rows = base.weaves
        .filter((w) => w.status === "completed" && base.posts.some((p) => p.id === w.post_id && p.org_id === orgId))
        .map((w) => ({
          id: w.id,
          post_id: w.post_id,
          created_at: w.created_at,
          receiver_org_unit_id: w.receiver_org_unit_id,
          quantity: base.weaveItems
            .filter((wi) => wi.weave_id === w.id)
            .reduce((sum, wi) => sum + wi.quantity, 0),
        }));
      return [rows, []];
    }

    if (sql === REPORT_TIER_EVENTS) {
      const rows = base.tierEvents
        .filter((e) => e.org_id === orgId)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id)
        .map((e) => ({ post_id: e.post_id, to_tier: e.to_tier, created_at: e.created_at }));
      return [rows, []];
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
