//* test:db 連的 MySQL。預設是 dev compose 的 MySQL（make dev-services，127.0.0.1:3307）；
//* CI 用 service container，以 TEST_DB_* 覆寫。測試只碰 TEST_DB_DATABASE 這個庫，每次執行重建
export const testDb = {
  host: process.env.TEST_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.TEST_DB_PORT ?? 3307),
  user: process.env.TEST_DB_USER ?? "root",
  password: process.env.TEST_DB_PASSWORD ?? "megaweave-root",
  database: process.env.TEST_DB_DATABASE ?? "megaweave_test",
};
