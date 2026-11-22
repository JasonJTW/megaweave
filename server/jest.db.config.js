/* eslint-disable @typescript-eslint/no-require-imports */
//* `npm run test:db`：*.db.test.ts 對真的 MySQL 跑（schema.sql 建庫），一次一個檔案
//* 連線設定見 src/testUtils/db/connection.ts；本機先 `make dev-services`
const base = require("./jest.config.js");

/** @type {import("jest").Config} **/
module.exports = {
  ...base,
  testMatch: ["<rootDir>/src/**/*.db.test.ts"],
  testPathIgnorePatterns: [],
  globalSetup: "<rootDir>/src/testUtils/db/globalSetup.ts",
  setupFiles: [...base.setupFiles, "<rootDir>/src/testUtils/db/env.ts"],
  maxWorkers: 1,
};
