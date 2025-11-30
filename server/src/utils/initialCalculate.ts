// server/src/scripts/initialCalculate.ts

import { RowDataPacket } from "mysql2";
import dbPool from "../utils/db";
import { batchUpdateUserStats } from "../utils/updateUserStats"; // 引用你優化過的批次更新函數

async function runInitialCalculation() {
  console.log("🚀 開始執行全量積分計算...");
  let connection;

  try {
    connection = await dbPool.getConnection();

    // 1. 獲取所有用戶 ID
    const userQuery = `SELECT id FROM users`;
    const [rows] = await connection.execute<RowDataPacket[]>(userQuery);

    const userIds = rows.map((row) => row.id.toString());

    console.log(`✅ 成功獲取 ${userIds.length} 個用戶 ID。`);

    // 2. 執行批次更新
    const result = await batchUpdateUserStats(userIds);

    console.log("--- 批次更新結果 ---");
    console.log(`成功更新數量: ${result.success}`);
    console.log(`失敗數量: ${result.failed}`);

    if (result.failed > 0) {
      console.error("⚠️ 失敗詳情 (僅顯示前 5 筆):", result.errors.slice(0, 5));
    }
    console.log("-----------------------");
  } catch (error) {
    console.error("❌ 全量計算發生致命錯誤:", error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    dbPool.end(); // 關閉連線池
  }
}

runInitialCalculation();
