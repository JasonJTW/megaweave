import { getDbPoolConfig } from "./db";

describe("Database Pool Configuration (Slice 1)", () => {
  // Minimal valid env without any connection limit set — used as base for throw tests.
  const baseEnv: NodeJS.ProcessEnv = {
    DB_HOST: "localhost",
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    DB_DATABASE: "test_db",
    DB_PORT: "3306",
  };

  // ── No APP_ROLE (generic) ─────────────────────────────────────────────────

  it("should throw when DB_CONNECTION_LIMIT is not set and APP_ROLE is unset", () => {
    expect(() => getDbPoolConfig(baseEnv)).toThrow(
      /Missing required env var "DB_CONNECTION_LIMIT"/,
    );
  });

  it("should use DB_CONNECTION_LIMIT when APP_ROLE is unset", () => {
    const config = getDbPoolConfig({ ...baseEnv, DB_CONNECTION_LIMIT: "20" });
    expect(config.connectionLimit).toBe(20);
    expect(config.maxIdle).toBe(10);
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(3306);
  });

  it("should throw when DB_CONNECTION_LIMIT is an invalid number", () => {
    expect(() =>
      getDbPoolConfig({ ...baseEnv, DB_CONNECTION_LIMIT: "invalid_num" }),
    ).toThrow(/Invalid value for "DB_CONNECTION_LIMIT"/);
  });

  it("should throw when DB_CONNECTION_LIMIT is 0 or negative", () => {
    expect(() =>
      getDbPoolConfig({ ...baseEnv, DB_CONNECTION_LIMIT: "0" }),
    ).toThrow(/Invalid value for "DB_CONNECTION_LIMIT"/);

    expect(() =>
      getDbPoolConfig({ ...baseEnv, DB_CONNECTION_LIMIT: "-5" }),
    ).toThrow(/Invalid value for "DB_CONNECTION_LIMIT"/);
  });

  // ── APP_ROLE=worker ───────────────────────────────────────────────────────

  it("should throw when APP_ROLE=worker and WORKER_DB_CONNECTION_LIMIT is not set", () => {
    expect(() =>
      getDbPoolConfig({ ...baseEnv, APP_ROLE: "worker" }),
    ).toThrow(/Missing required env var "WORKER_DB_CONNECTION_LIMIT"/);
  });

  it("should use WORKER_DB_CONNECTION_LIMIT when APP_ROLE is worker", () => {
    const config = getDbPoolConfig({
      ...baseEnv,
      APP_ROLE: "worker",
      WORKER_DB_CONNECTION_LIMIT: "7",
    });
    expect(config.connectionLimit).toBe(7);
    expect(config.maxIdle).toBeLessThanOrEqual(7);
  });

  it("should throw when WORKER_DB_CONNECTION_LIMIT is invalid", () => {
    expect(() =>
      getDbPoolConfig({
        ...baseEnv,
        APP_ROLE: "worker",
        WORKER_DB_CONNECTION_LIMIT: "abc",
      }),
    ).toThrow(/Invalid value for "WORKER_DB_CONNECTION_LIMIT"/);
  });

  // ── APP_ROLE=api ──────────────────────────────────────────────────────────

  it("should throw when APP_ROLE=api and API_DB_CONNECTION_LIMIT is not set", () => {
    expect(() =>
      getDbPoolConfig({ ...baseEnv, APP_ROLE: "api" }),
    ).toThrow(/Missing required env var "API_DB_CONNECTION_LIMIT"/);
  });

  it("should use API_DB_CONNECTION_LIMIT when APP_ROLE is api", () => {
    const config = getDbPoolConfig({
      ...baseEnv,
      APP_ROLE: "api",
      API_DB_CONNECTION_LIMIT: "18",
    });
    expect(config.connectionLimit).toBe(18);
    expect(config.maxIdle).toBe(10);
  });

  it("should throw when API_DB_CONNECTION_LIMIT is invalid", () => {
    expect(() =>
      getDbPoolConfig({
        ...baseEnv,
        APP_ROLE: "api",
        API_DB_CONNECTION_LIMIT: "0",
      }),
    ).toThrow(/Invalid value for "API_DB_CONNECTION_LIMIT"/);
  });

  // ── maxIdle cap ───────────────────────────────────────────────────────────

  it("should cap maxIdle at 10 even when connectionLimit is large", () => {
    const config = getDbPoolConfig({ ...baseEnv, DB_CONNECTION_LIMIT: "50" });
    expect(config.maxIdle).toBe(10);
  });

  it("should set maxIdle equal to connectionLimit when it is small", () => {
    const config = getDbPoolConfig({
      ...baseEnv,
      APP_ROLE: "worker",
      WORKER_DB_CONNECTION_LIMIT: "3",
    });
    expect(config.maxIdle).toBe(3);
  });
});
