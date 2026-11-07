//* 交易樣板：取得 connection → begin → fn → commit；fn 丟錯就 rollback 並把原本的錯誤往上丟，最後一定 release
import type { PoolConnection } from "mysql2/promise";
import dbPool from "./db";

export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    //* rollback 失敗時仍丟出原本的錯誤
    await connection
      .rollback()
      .catch((e) => console.error("Rollback failed:", e));
    throw error;
  } finally {
    connection.release();
  }
}
