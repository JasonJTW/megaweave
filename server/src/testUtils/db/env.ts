//* 讓 utils/db 的 pool 連到 test:db 的庫（globalSetup 已用 schema.sql 建好）
import { testDb } from "./connection";

process.env.DB_HOST = testDb.host;
process.env.DB_PORT = String(testDb.port);
process.env.DB_USER = testDb.user;
process.env.DB_PASSWORD = testDb.password;
process.env.DB_DATABASE = testDb.database;
