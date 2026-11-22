//* test:db 開始前重建測試庫：schema.sql 是唯一完整 schema（ADR 0009），reference-data.sql 是分類等參考資料
import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { testDb } from "./connection";

const DB_DIR = path.resolve(__dirname, "../../../db");

//* mysqldump 的 schema.sql 用 `DELIMITER ;;` 包 trigger，那是 mysql CLI 的語法，driver 不認得：
//* 依目前的 delimiter 切成一句一句送出
export function splitSqlScript(script: string): string[] {
  const statements: string[] = [];
  let delimiter = ";";
  let current: string[] = [];
  for (const line of script.split("\n")) {
    const change = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (change) {
      delimiter = change[1];
      continue;
    }
    current.push(line);
    if (line.trimEnd().endsWith(delimiter)) {
      const text = current.join("\n").trimEnd();
      const statement = text.slice(0, text.length - delimiter.length).trim();
      if (statement) statements.push(statement);
      current = [];
    }
  }
  const rest = current.join("\n").trim();
  if (rest) statements.push(rest);
  return statements;
}

async function runScript(connection: mysql.Connection, file: string): Promise<void> {
  for (const statement of splitSqlScript(readFileSync(path.join(DB_DIR, file), "utf8"))) {
    await connection.query(statement);
  }
}

export default async function globalSetup(): Promise<void> {
  if (!/^[a-z0-9_]+_test$/.test(testDb.database)) {
    throw new Error(
      `[test:db] TEST_DB_DATABASE must end in _test (got "${testDb.database}"): it is dropped on every run`,
    );
  }
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host: testDb.host,
      port: testDb.port,
      user: testDb.user,
      password: testDb.password,
    });
  } catch (error) {
    throw new Error(
      `[test:db] Cannot reach MySQL at ${testDb.host}:${testDb.port}. ` +
        "Start it with `make dev-services`, or point TEST_DB_HOST/TEST_DB_PORT at another MySQL 8. " +
        `(${(error as Error).message})`,
    );
  }
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${testDb.database}\``);
    await connection.query(
      `CREATE DATABASE \`${testDb.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${testDb.database}\``);
    await runScript(connection, "schema.sql");
    await runScript(connection, "reference-data.sql");
  } finally {
    await connection.end();
  }
}
