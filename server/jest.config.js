/* eslint-disable @typescript-eslint/no-require-imports */
const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import(\"jest\").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // Runs before each test worker process starts, before any module is imported.
  // Sets the minimum env vars required by fail-fast validation in db.ts.
  setupFiles: ["<rootDir>/src/jest.setup.ts"],
  // npm run build / benchmark:api 會輸出 dist/，其中的 __mocks__ 會與 src 重複
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  forceExit: true,
};