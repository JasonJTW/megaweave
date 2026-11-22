//* 每個 test:db 測試前清空資料表（保留 reference-data.sql 的參考資料），測試彼此不共用資料
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import dbPool, { closeDatabase } from "../../utils/db";

const REFERENCE_TABLES = new Set(
  [
    ...readFileSync(path.resolve(__dirname, "../../../db/reference-data.sql"), "utf8").matchAll(
      /INSERT INTO `(\w+)`/g,
    ),
  ].map((m) => m[1]),
);

let tables: string[] | null = null;

export async function resetDb(): Promise<void> {
  if (!tables) {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );
    tables = rows.map((r) => r.name as string).filter((name) => !REFERENCE_TABLES.has(name));
  }
  const connection = await dbPool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) await connection.query(`TRUNCATE TABLE \`${table}\``);
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    connection.release();
  }
}

export { closeDatabase };
