//* Weave 的庫存：申請時軟檢查、核准預留、取消釋放、完成扣除（都在 items 列的 FOR UPDATE 鎖底下）
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import dbPool from "../../utils/db";
import { WeaveError } from "./types";

type StockExecutor = Pick<PoolConnection, "execute">;

/**
 * 庫存模型（migration 20261113000000_add_item_reserved_quantity）：
 * - items.quantity：還沒交出去的庫存，交織完成才扣
 * - items.reserved_quantity：其中已被 Approved 交織預留的數量
 * - 可申請數量 = quantity - reserved_quantity
 * 預留的增減都在 items 列的 FOR UPDATE 鎖底下做，兩筆核准搶同一批庫存時會排隊
 */
export function availableOf(row: RowDataPacket): number {
  return Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));
}

function insufficientStock(title: string, requested: number, available: number) {
  return new WeaveError(
    400,
    "INSUFFICIENT_STOCK",
    `Insufficient stock for "${title}": requested ${requested}, available ${available}`,
    { title, available },
  );
}

/**
 * 軟檢查：送出申請時，數量是否超過可申請數量（扣掉已預留的；無鎖，只做早期回饋，
 * 真正保證在 reserveInventory）
 */
export async function validateItems(
  items: Array<{ itemId: number | null; quantity: number }>,
  postId: number,
): Promise<void> {
  for (const item of items) {
    if (!item.itemId) continue;
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT quantity, reserved_quantity, title FROM items WHERE id = ? AND post_id = ?`,
      [item.itemId, postId],
    );
    if (rows.length === 0)
      throw new WeaveError(
        404,
        "ITEM_UNAVAILABLE",
        `Item ${item.itemId} does not exist in this post`,
      );
    const available = availableOf(rows[0]);
    if (available < item.quantity)
      throw insufficientStock(rows[0].title, item.quantity, available);
  }
}

async function getWeaveStockItems(
  connection: StockExecutor,
  weaveId: string | number,
): Promise<Array<{ itemId: number; quantity: number }>> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT item_id, SUM(quantity) AS quantity
     FROM weave_items
     WHERE weave_id = ? AND item_id IS NOT NULL
     GROUP BY item_id`,
    [weaveId],
  );
  return rows.map((r) => ({
    itemId: Number(r.item_id),
    quantity: Number(r.quantity),
  }));
}

/**
 * 鎖住這筆 Weave 的 items 列（依 id 排序，避免多筆交易互鎖）。
 * 品項已被刪除（貼文編輯會重建 items）時，weave_items.item_id 已是 NULL，不會出現在這裡
 */
export async function lockWeaveStock(
  connection: StockExecutor,
  weaveId: string | number,
) {
  const items = await getWeaveStockItems(connection, weaveId);
  if (items.length === 0) return [];

  const ids = items.map((it) => it.itemId);
  const [stockRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, title, quantity, reserved_quantity FROM items
     WHERE id IN (${ids.map(() => "?").join(", ")})
     ORDER BY id
     FOR UPDATE`,
    ids,
  );
  const stockById = new Map(stockRows.map((r) => [Number(r.id), r]));

  return items.map((item) => {
    const stock = stockById.get(item.itemId);
    if (!stock)
      throw new WeaveError(
        400,
        "ITEM_UNAVAILABLE",
        `Item ${item.itemId} is no longer available`,
      );
    return { ...item, stock };
  });
}

/**
 * 核准時預留：可申請數量（扣掉其他已核准的）不夠就拋 INSUFFICIENT_STOCK，由呼叫端 rollback，
 * Weave 維持 requested
 */
export async function reserveInventory(
  connection: StockExecutor,
  weaveId: string | number,
): Promise<void> {
  const items = await lockWeaveStock(connection, weaveId);
  for (const { stock, quantity } of items) {
    const available = availableOf(stock);
    if (available < quantity)
      throw insufficientStock(stock.title, quantity, available);
  }
  for (const { itemId, quantity } of items) {
    await connection.execute(
      `UPDATE items SET reserved_quantity = reserved_quantity + ? WHERE id = ?`,
      [quantity, itemId],
    );
  }
}

/** 已核准的 Weave 取消：把預留還回去 */
export async function releaseInventory(
  connection: StockExecutor,
  weaveId: string | number,
): Promise<void> {
  const items = await lockWeaveStock(connection, weaveId);
  for (const { itemId, quantity } of items) {
    await connection.execute(
      `UPDATE items SET reserved_quantity = GREATEST(reserved_quantity - ?, 0) WHERE id = ?`,
      [quantity, itemId],
    );
  }
}

/** 已核准的 Weave：預留已含在 reserved_quantity，只需確認手上庫存還夠 */
export function assertOnHand(
  items: Awaited<ReturnType<typeof lockWeaveStock>>,
): void {
  for (const { stock, quantity } of items) {
    if (Number(stock.quantity) < quantity)
      throw insufficientStock(stock.title, quantity, Number(stock.quantity));
  }
}

/**
 * 完成時扣庫存並釋放預留。核准時已預留，正常不會不足；不足只會發生在核准後
 * 庫存被改小，此時拋 INSUFFICIENT_STOCK，由呼叫端 rollback（Weave 維持 approved，雙方可再溝通）
 */
export async function deductInventory(
  connection: StockExecutor,
  weaveId: string | number,
): Promise<void> {
  const items = await lockWeaveStock(connection, weaveId);
  assertOnHand(items);
  for (const { itemId, quantity } of items) {
    await connection.execute(
      `UPDATE items
       SET quantity = quantity - ?, reserved_quantity = GREATEST(reserved_quantity - ?, 0)
       WHERE id = ?`,
      [quantity, quantity, itemId],
    );
  }
}

/**
 * 這筆交織是否等於「整篇貼文的全部物品」：沒指定物品，或每一種物品都選了而且數量拿滿。
 * 只有一種物品的貼文選 2 張（剩 5 張）不算全部。
 * `postItems` 的數量要傳可申請數量（quantity - reserved_quantity），不是手上庫存。
 */
export function isWholePostRequest(
  items: Array<{ itemId: number | null; quantity: number }>,
  postItems: Array<{ id: number; quantity: number }>,
): boolean {
  if (items.length === 0 || items[0]?.itemId === null) return true;
  return (
    postItems.length > 0 &&
    items.length === postItems.length &&
    postItems.every((pi) =>
      items.some((it) => it.itemId === pi.id && it.quantity >= pi.quantity),
    )
  );
}
