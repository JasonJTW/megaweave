//* 誰能看、追蹤一張外送單：下單的人、它服務的 Weave 的 Giver 與 Receiver（ADR 0001），或 Platform Admin。
//* 沒有對應 Weave 的舊單（weave_id 為 NULL）沿用舊規則：下單的人或 Post Author
import type { RowDataPacket } from "mysql2/promise";
import type { Queryable } from "../orgService";

/** 查外送單時一起選的欄位；需要 `d`（delivery_orders）、`p`（posts）與 DELIVERY_ACCESS_JOIN */
export const DELIVERY_ACCESS_COLUMNS =
  "d.user_id AS orderer_id, p.user_id AS post_author_id, w.giver_id AS weave_giver_id, w.receiver_id AS weave_receiver_id";
export const DELIVERY_ACCESS_JOIN = "LEFT JOIN weaves w ON w.id = d.weave_id";

export interface DeliveryAccessRow {
  orderer_id: number | null;
  post_author_id: number | null;
  weave_giver_id: number | null;
  weave_receiver_id: number | null;
}

export function canViewDeliveryOrder(
  row: DeliveryAccessRow,
  user: { userId: number; role?: string },
): boolean {
  if (user.role === "admin") return true;
  const is = (id: number | null) => id != null && Number(id) === user.userId;
  if (is(row.orderer_id)) return true;
  if (row.weave_giver_id != null) return is(row.weave_giver_id) || is(row.weave_receiver_id);
  return is(row.post_author_id);
}

/** 依 Lalamove 訂單編號或本機 id 找外送單並判斷；找不到回 null */
export async function deliveryAccessFor(
  db: Pick<Queryable, "query">,
  orderId: string,
  user: { userId: number; role?: string },
): Promise<boolean | null> {
  const [rows] = await db.query<(DeliveryAccessRow & RowDataPacket)[]>(
    `SELECT ${DELIVERY_ACCESS_COLUMNS}
     FROM delivery_orders d
     LEFT JOIN posts p ON d.post_id = p.id
     ${DELIVERY_ACCESS_JOIN}
     WHERE d.lalamove_order_id = ? OR d.id = ?
     LIMIT 1`,
    [orderId, orderId],
  );
  if (rows.length === 0) return null;
  return canViewDeliveryOrder(rows[0], user);
}
