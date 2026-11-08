//* 組織報表的查詢（#143）：讀流轉紀錄交給 buildOrgReport（orgReport.ts）
//* - 物品：組織的貼文，含已刪除但有完成 Weave 的（流出去的件數不能因為下架而消失）
//* - Weave：只讀 completed；件數 = weave_items.quantity 加總
//* - 層級：org_post_tier_events（#138），沒有事件的物品一直在 Internal
import type { RowDataPacket } from "mysql2/promise";
import dbPool from "../utils/db";
import type { CategoryId } from "./avoidedEmissions/factorTable";
import type { AudienceTier } from "./postVisibility";
import { buildOrgReport, OrgReport } from "./orgReport";

export async function getOrgReport(orgId: number): Promise<OrgReport> {
  const [[units], [posts], [weaves], [events]] = await Promise.all([
    dbPool.query<RowDataPacket[]>(
      "SELECT id, name FROM org_units WHERE org_id = ? ORDER BY name",
      [orgId],
    ),
    dbPool.query<RowDataPacket[]>(
      `SELECT p.id, p.org_unit_id, d.org_category, d.quantity, d.unit_weight_kg,
              d.weight_is_default, d.estimated_value_twd
       FROM posts p
       LEFT JOIN org_post_details d ON d.post_id = p.id
       WHERE p.org_id = ?
         AND (p.deleted_at IS NULL
              OR EXISTS (SELECT 1 FROM weaves w WHERE w.post_id = p.id AND w.status = 'completed'))`,
      [orgId],
    ),
    dbPool.query<RowDataPacket[]>(
      `SELECT w.id, w.post_id, w.created_at, w.receiver_org_unit_id,
              COALESCE(SUM(wi.quantity), 0) AS quantity
       FROM weaves w
       JOIN posts p ON p.id = w.post_id
       LEFT JOIN weave_items wi ON wi.weave_id = w.id
       WHERE p.org_id = ? AND w.status = 'completed'
       GROUP BY w.id, w.post_id, w.created_at, w.receiver_org_unit_id`,
      [orgId],
    ),
    dbPool.query<RowDataPacket[]>(
      `SELECT post_id, to_tier, created_at FROM org_post_tier_events
       WHERE org_id = ? ORDER BY created_at, id`,
      [orgId],
    ),
  ]);

  return buildOrgReport({
    units: units.map((u) => ({ id: Number(u.id), name: String(u.name) })),
    posts: posts.map((p) => ({
      postId: Number(p.id),
      unitId: Number(p.org_unit_id),
      orgCategory: (p.org_category ?? null) as CategoryId | null,
      quantity: p.quantity == null ? null : Number(p.quantity),
      unitWeightKg: p.unit_weight_kg == null ? null : Number(p.unit_weight_kg),
      weightIsDefault: p.weight_is_default == null ? null : Boolean(Number(p.weight_is_default)),
      estimatedValueTwd: p.estimated_value_twd == null ? null : Number(p.estimated_value_twd),
    })),
    weaves: weaves.map((w) => ({
      weaveId: Number(w.id),
      postId: Number(w.post_id),
      //* 組織 Weave 一定有 weave_items；萬一沒有，算 1 件而不是 0（不讓一次完成的交接消失）
      quantity: Math.max(1, Number(w.quantity)),
      createdAt: new Date(w.created_at),
      receiverUnitId: w.receiver_org_unit_id == null ? null : Number(w.receiver_org_unit_id),
    })),
    tierEvents: events.map((e) => ({
      postId: Number(e.post_id),
      toTier: e.to_tier as AudienceTier,
      createdAt: new Date(e.created_at),
    })),
  });
}
