// server/src/utils/__mocks__/db.ts
// Manual mock used when tests call jest.mock("../../utils/db") (or any relative path to utils/db).
// Provides jest.fn() stubs for the methods tests commonly call on the dbPool default export.

const dbPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
};

export const closeDatabase = jest.fn().mockResolvedValue(undefined);
export const getDbPoolConfig = jest.fn();
export default dbPool;
