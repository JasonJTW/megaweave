//* 測試用的記憶體 MySQL：在 fakeOrgTierDb 之上加 Auto Release（#139）的語句：
//* 候選物品、物品的申請時間軸、鎖定貼文、單件覆寫。不認得的交給下一層，最底層丟錯
import { createFakeOrgTierDb, FakeOrgTierDb } from "./fakeOrgTierDb";

type Result = [unknown, unknown];

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

const CANDIDATES =
  /^SELECT p\.id, p\.public_id, p\.org_id, o\.name AS org_name, o\.auto_release_enabled, o\.auto_release_days AS org_days, d\.auto_release_override, d\.auto_release_days AS override_days, COALESCE\(\(SELECT MAX\(e\.created_at\) FROM org_post_tier_events e WHERE e\.post_id = p\.id\), p\.created_at\) AS tier_entered_at FROM posts p JOIN organizations o ON o\.id = p\.org_id LEFT JOIN org_post_details d ON d\.post_id = p\.id WHERE p\.audience_tier = 'internal' AND p\.status = 'active' AND p\.deleted_at IS NULL AND \(d\.auto_release_override = 'auto' OR \(d\.auto_release_override IS NULL AND o\.auto_release_enabled = 1\)\)( AND p\.id = \?)? ORDER BY p\.id LIMIT \d+$/;

export function createFakeOrgAutoReleaseDb(
  seed: Parameters<typeof createFakeOrgTierDb>[0],
): FakeOrgTierDb {
  const base = createFakeOrgTierDb(seed);

  function run(rawSql: unknown, rawParams: unknown): Result | null {
    const sql = normalize(String(rawSql));
    const params = (rawParams ?? []) as unknown[];

    const candidates = sql.match(CANDIDATES);
    if (candidates) {
      const rows = base.posts
        .filter((p) => !candidates[1] || p.id === Number(params[0]))
        .filter((p) => p.audience_tier === "internal" && p.status === "active" && p.deleted_at === null)
        .map((p) => {
          const o = base.organizations.find((org) => org.id === p.org_id)!;
          const d = base.details.find((detail) => detail.post_id === p.id);
          const events = base.tierEvents.filter((e) => e.post_id === p.id);
          const latest = events.length
            ? new Date(Math.max(...events.map((e) => e.created_at.getTime())))
            : null;
          return {
            id: p.id,
            public_id: p.public_id,
            org_id: p.org_id,
            org_name: o.name,
            auto_release_enabled: o.auto_release_enabled ? 1 : 0,
            org_days: o.auto_release_days,
            auto_release_override: d?.auto_release_override ?? null,
            override_days: d?.auto_release_days ?? null,
            tier_entered_at: latest ?? p.created_at,
          };
        })
        .filter(
          (r) =>
            r.auto_release_override === "auto" ||
            (r.auto_release_override === null && r.auto_release_enabled === 1),
        )
        .sort((a, b) => a.id - b.id);
      return [rows, []];
    }

    if (
      sql ===
      "SELECT post_id, status, created_at, updated_at, completed_at FROM weaves WHERE post_id IN (?)"
    ) {
      const ids = (params[0] as number[]).map(Number);
      const rows = base.weaves
        .filter((w) => ids.includes(w.post_id))
        .map((w) => ({
          post_id: w.post_id,
          status: w.status,
          created_at: w.created_at,
          updated_at: w.updated_at ?? w.created_at,
          completed_at: w.completed_at,
        }));
      return [rows, []];
    }

    if (sql === "SELECT id FROM posts WHERE id = ? FOR UPDATE") {
      const rows = base.posts
        .filter((p) => p.id === Number(params[0]))
        .map((p) => ({ id: p.id }));
      return [rows, []];
    }

    if (
      sql ===
      "UPDATE org_post_details SET auto_release_override = ?, auto_release_days = ? WHERE post_id = ?"
    ) {
      const detail = base.details.find((d) => d.post_id === Number(params[2]));
      if (detail) {
        detail.auto_release_override = (params[0] as "auto" | "manual" | null) ?? null;
        detail.auto_release_days = params[1] == null ? null : Number(params[1]);
      }
      return [{ affectedRows: detail ? 1 : 0 }, []];
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
