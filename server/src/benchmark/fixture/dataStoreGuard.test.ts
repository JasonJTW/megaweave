import type { Pool } from "mysql2/promise";
import type { AppRedisClient } from "../../utils/redis";
import { BenchmarkSafetyError } from "../errors";
import { assertBenchmarkDataStores, FixtureStores } from "./dataStoreGuard";
import { generateFixture } from "./generateFixture";
import { loadFixture, resetFixture } from "./loadFixture";

interface FakeStoreOptions {
  mysqlMarker?: { rows?: Record<string, unknown>[]; errorCode?: string };
  cacheMarker?: string | null;
  vectorMarker?: string | null;
}

/** 記錄所有呼叫的假資料儲存；只有標記查詢會回應，其他任何操作都會被記錄為寫入。 */
function createFakeStores(options: FakeStoreOptions = {}) {
  const calls: string[] = [];
  const mysqlMarker = options.mysqlMarker ?? { rows: [{ marker: "megaweave-isolated" }] };

  const mysql = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push(`mysql:${sql}`);
      if (sql === "SELECT marker FROM ??" && params?.[0] === "benchmark_environment") {
        if (mysqlMarker.errorCode) {
          throw Object.assign(new Error(mysqlMarker.errorCode), { code: mysqlMarker.errorCode });
        }
        return [mysqlMarker.rows ?? [], []];
      }
      return [[], []];
    }),
    getConnection: jest.fn(async () => {
      calls.push("mysql:getConnection");
      throw new Error("unexpected connection");
    }),
  };

  const createRedis = (name: string, marker: string | null | undefined) =>
    new Proxy(
      {},
      {
        get: (_target, prop: string) =>
          jest.fn(async (...args: unknown[]) => {
            calls.push(`${name}:${prop}`);
            if (prop === "get" && args[0] === "benchmark:environment") {
              return marker === undefined ? "megaweave-isolated" : marker;
            }
            return null;
          }),
      },
    ) as unknown as AppRedisClient;

  const stores: FixtureStores = {
    mysql: mysql as unknown as Pool,
    cacheRedis: createRedis("cache", options.cacheMarker),
    vectorRedis: createRedis("vector", options.vectorMarker),
  };

  const writes = () =>
    calls.filter(
      (call) =>
        call !== "mysql:SELECT marker FROM ??" && call !== "cache:get" && call !== "vector:get",
    );

  return { stores, calls, writes };
}

describe("benchmark data store guard", () => {
  it("accepts data stores that all carry the benchmark marker", async () => {
    const { stores } = createFakeStores();

    await expect(assertBenchmarkDataStores(stores)).resolves.toBeUndefined();
  });

  it.each<[string, FakeStoreOptions]>([
    ["MySQL has no marker table", { mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } }],
    ["MySQL cannot be queried", { mysqlMarker: { errorCode: "ECONNREFUSED" } }],
    ["the MySQL marker table is empty", { mysqlMarker: { rows: [] } }],
    ["the MySQL marker has another value", { mysqlMarker: { rows: [{ marker: "production" }] } }],
    [
      "the MySQL marker table has extra rows",
      { mysqlMarker: { rows: [{ marker: "megaweave-isolated" }, { marker: "production" }] } },
    ],
    ["cache Redis has no marker", { cacheMarker: null }],
    ["vector Redis has another marker", { vectorMarker: "production" }],
  ])("refuses when %s", async (_label, options) => {
    const { stores } = createFakeStores(options);

    await expect(assertBenchmarkDataStores(stores)).rejects.toBeInstanceOf(BenchmarkSafetyError);
  });

  it.each<[string, FakeStoreOptions]>([
    ["MySQL is not a benchmark database", { mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } }],
    ["cache Redis is not a benchmark instance", { cacheMarker: null }],
    ["vector Redis is not a benchmark instance", { vectorMarker: null }],
  ])("resets nothing when %s", async (_label, options) => {
    const { stores, writes } = createFakeStores(options);

    await expect(resetFixture(stores)).rejects.toBeInstanceOf(BenchmarkSafetyError);
    expect(writes()).toEqual([]);
  });

  it("loads nothing when the target is not a benchmark database", async () => {
    const { stores, writes } = createFakeStores({ mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } });
    const dataset = generateFixture({ seed: 1, posts: 100 });

    await expect(loadFixture(stores, dataset)).rejects.toBeInstanceOf(BenchmarkSafetyError);
    expect(writes()).toEqual([]);
  });
});
