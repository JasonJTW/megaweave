// server/src/jest.setup.ts
// Provides the minimum env vars required by fail-fast validation in db.ts.
// Tests that make real DB queries must mock the db module directly.
// These values allow the pool config to be constructed without throwing;
// the pool itself will never connect in the unit test environment.

process.env.DB_CONNECTION_LIMIT = process.env.DB_CONNECTION_LIMIT ?? "20";
process.env.WORKER_DB_CONNECTION_LIMIT =
  process.env.WORKER_DB_CONNECTION_LIMIT ?? "5";
process.env.API_DB_CONNECTION_LIMIT =
  process.env.API_DB_CONNECTION_LIMIT ?? "15";
