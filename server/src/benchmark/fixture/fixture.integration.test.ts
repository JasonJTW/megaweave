// 需要 benchmark 隔離環境：make benchmark-up 後以 BENCHMARK_INTEGRATION=1 執行，否則整組略過。
//   cd server && BENCHMARK_INTEGRATION=1 npx jest src/benchmark/fixture/fixture.integration.test.ts

import { createClient } from "@redis/client";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { createPool, Pool, RowDataPacket } from "mysql2/promise";
import { resolve } from "path";
import type { AppRedisClient } from "../../utils/redis";
import { BenchmarkSafetyError } from "../errors";
import { BENCHMARK_REDIS_MARKER_KEY, FixtureStores } from "./dataStoreGuard";
import { DEFAULT_FIXTURE_SEED, FixtureDataset, generateFixture } from "./generateFixture";
import { loadFixture } from "./loadFixture";
import { validateFixture } from "./validateFixture";

const describeIntegration =
  process.env.BENCHMARK_INTEGRATION === "1" ? describe : describe.skip;
const benchmarkEnv = dotenv.parse(readFileSync(resolve(__dirname, "../../../benchmark.env")));

// 每次載入需重置並寫入整個資料集，遠超過 Jest 預設的 5 秒
jest.setTimeout(120_000);

describeIntegration("benchmark fixture against the isolated environment", () => {
  let mysql: Pool;
  let cacheRedis: AppRedisClient;
  let vectorRedis: AppRedisClient;
  let stores: FixtureStores;
  let dataset: FixtureDataset;

  const countPosts = async () => {
    const [[row]] = await mysql.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM posts");
    return Number(row.total);
  };

  beforeAll(async () => {
    mysql = createPool({
      host: benchmarkEnv.DB_HOST,
      port: Number(benchmarkEnv.DB_PORT),
      user: benchmarkEnv.DB_USER,
      password: benchmarkEnv.DB_PASSWORD,
      database: benchmarkEnv.DB_DATABASE,
      timezone: "+00:00",
      connectionLimit: 5,
    });
    cacheRedis = createClient({ url: benchmarkEnv.REDIS_CACHE_URL }) as unknown as AppRedisClient;
    vectorRedis = createClient({ url: benchmarkEnv.REDIS_VECTOR_URL }) as unknown as AppRedisClient;
    await Promise.all([cacheRedis.connect(), vectorRedis.connect()]);
    stores = { mysql, cacheRedis, vectorRedis };
    dataset = generateFixture({ seed: DEFAULT_FIXTURE_SEED, posts: 1_000 });
  });

  afterAll(async () => {
    await Promise.allSettled([cacheRedis?.quit(), vectorRedis?.quit(), mysql?.end()]);
  });

  it("loads a fixture that passes every validation check", async () => {
    await loadFixture(stores, dataset);

    const checks = await validateFixture(stores, dataset);
    expect(checks.every((check) => check.ok)).toBe(true);
    expect(await countPosts()).toBe(1_000);
  });

  it("replaces rather than duplicates data when loaded again", async () => {
    await loadFixture(stores, dataset);

    await expect(validateFixture(stores, dataset)).resolves.toBeDefined();
    const [[first]] = await mysql.query<RowDataPacket[]>(
      "SELECT public_id, title FROM posts WHERE id = 1",
    );
    expect(first).toEqual({ public_id: dataset.posts[0].public_id, title: dataset.posts[0].title });
  });

  it("preserves reference data and benchmark markers across resets", async () => {
    const [[reference]] = await mysql.query<RowDataPacket[]>(`
      SELECT (SELECT COUNT(*) FROM categories) AS categories,
             (SELECT COUNT(*) FROM conditions) AS conditions,
             (SELECT COUNT(*) FROM benchmark_environment) AS markers
    `);

    expect(reference).toEqual({ categories: 10, conditions: 5, markers: 1 });
    expect(await cacheRedis.get(BENCHMARK_REDIS_MARKER_KEY)).toBe("megaweave-isolated");
    expect(await vectorRedis.get(BENCHMARK_REDIS_MARKER_KEY)).toBe("megaweave-isolated");
  });

  it("refuses to reset a MySQL database without the marker", async () => {
    await mysql.query("DELETE FROM benchmark_environment");
    try {
      await expect(loadFixture(stores, dataset)).rejects.toBeInstanceOf(BenchmarkSafetyError);
      expect(await countPosts()).toBe(1_000);
    } finally {
      await mysql.query("INSERT INTO benchmark_environment (marker) VALUES ('megaweave-isolated')");
    }
  });

  it("refuses to reset when a Redis instance lacks the marker", async () => {
    await vectorRedis.del(BENCHMARK_REDIS_MARKER_KEY);
    try {
      await expect(loadFixture(stores, dataset)).rejects.toBeInstanceOf(BenchmarkSafetyError);
      expect(await countPosts()).toBe(1_000);
      expect(await cacheRedis.zCard("feed:trending")).toBe(dataset.counts.trendingPosts);
    } finally {
      await vectorRedis.set(BENCHMARK_REDIS_MARKER_KEY, "megaweave-isolated");
    }
  });

  it("serves the fixture through the production feed service", async () => {
    Object.assign(process.env, benchmarkEnv);
    let feedModule!: typeof import("../../services/feedService");
    let redisModule!: typeof import("../../utils/redis");
    let dbModule!: typeof import("../../utils/db");
    // 重新載入模組，讓 redis / db 單例讀到 benchmark 連線設定
    await jest.isolateModulesAsync(async () => {
      redisModule = await import("../../utils/redis");
      dbModule = await import("../../utils/db");
      feedModule = await import("../../services/feedService");
    });
    await redisModule.connectRedis();

    try {
      const personalizedUser = dataset.userProfiles.find((profile) => profile.has_interest_vector)!;
      const coldStartUser = dataset.userProfiles.find((profile) => !profile.has_interest_vector)!;

      const anonymous = await feedModule.feedService.getFeed({ page: 1, limit: 20 });
      const personalized = await feedModule.feedService.getFeed({
        page: 1,
        limit: 20,
        userId: personalizedUser.user_id,
      });
      const coldStart = await feedModule.feedService.getFeed({
        page: 1,
        limit: 20,
        userId: coldStartUser.user_id,
      });

      expect(anonymous.posts).toHaveLength(20);
      expect(anonymous.pagination.totalPosts).toBe(dataset.counts.trendingPosts);
      expect(personalized.isPersonalized).toBe(true);
      expect(personalized.posts).toHaveLength(20);
      expect(coldStart.isPersonalized).toBe(false);
      expect(coldStart.posts).toHaveLength(20);
      expect(anonymous.posts[0]).toMatchObject({
        username: expect.any(String),
        category_name_en: expect.any(String),
      });
    } finally {
      await redisModule.disconnectRedis();
      await dbModule.closeDatabase();
    }
  });
});
