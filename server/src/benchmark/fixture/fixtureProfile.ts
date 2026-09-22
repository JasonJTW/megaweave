// server/src/benchmark/fixture/fixtureProfile.ts
// fixture-* profile：重置 benchmark 資料儲存、載入確定性資料集並驗證。
// 資料庫與 Redis 模組延遲載入，讓不需要資料儲存的 profile（如 environment-check）不會建立任何連線。

import type { Pool } from "mysql2/promise";
import type { BenchmarkProfile, BenchmarkProfileOutcome } from "../profiles";
import type { FixtureStores } from "./dataStoreGuard";
import { EMBEDDING_MODEL_VERSION } from "./embeddings";
import { DEFAULT_FIXTURE_SEED, FixtureOptions } from "./generateFixture";

/** 產生、重置、載入並驗證 fixture；供 fixture-* 與之後的 feed / queue profile 共用。 */
export async function prepareFixture(
  stores: FixtureStores,
  options: FixtureOptions,
): Promise<BenchmarkProfileOutcome> {
  const { generateFixture } = await import("./generateFixture");
  const { loadFixture } = await import("./loadFixture");
  const { validateFixture } = await import("./validateFixture");

  const started = Date.now();
  const dataset = generateFixture(options);
  const generateMs = Date.now() - started;
  const timings = await loadFixture(stores, dataset);
  const validation = await validateFixture(stores, dataset);

  return {
    dataset: {
      version: dataset.version,
      counts: dataset.counts,
      fingerprint: dataset.fingerprint,
    },
    result: {
      timingsMs: { generate: generateMs, ...timings },
      validation,
    },
  };
}

export interface AppStores extends FixtureStores {
  connectRedis(): Promise<void>;
  close(): Promise<void>;
}

/** 以 benchmark.env 設定連線到 benchmark MySQL / Redis；呼叫端須在寫入前確認資料儲存標記。 */
export async function openAppStores(): Promise<AppStores> {
  const db = await import("../../utils/db");
  const redis = await import("../../utils/redis");
  return {
    mysql: db.default as unknown as Pool,
    cacheRedis: redis.cacheRedisClient,
    vectorRedis: redis.vectorRedisClient,
    connectRedis: redis.connectRedis,
    close: async () => {
      await redis.disconnectRedis();
      await db.closeDatabase();
    },
  };
}

export function createFixtureProfile(options: {
  name: string;
  posts: number;
  seed?: number;
}): BenchmarkProfile {
  const fixtureOptions = { posts: options.posts, seed: options.seed ?? DEFAULT_FIXTURE_SEED };
  let stores: AppStores | null = null;

  return {
    name: options.name,
    description: `Resets the benchmark data stores and loads a deterministic ${options.posts}-post fixture`,
    touchesTarget: false,
    workload: {
      operation: "reset-and-load",
      ...fixtureOptions,
      embeddings: EMBEDDING_MODEL_VERSION,
    },
    dependencies: { mysql: "benchmark", redis: "benchmark", openai: "mock" },

    async assertSafeToRun() {
      const { assertBenchmarkDataStores, assertBenchmarkMysql } = await import("./dataStoreGuard");
      stores = await openAppStores();
      // 先確認 MySQL 標記再連 Redis：指向錯誤資料庫時立即失敗，不必等待 Redis 重連逾時
      await assertBenchmarkMysql(stores.mysql);
      await stores.connectRedis();
      await assertBenchmarkDataStores(stores);
    },

    run: async () => prepareFixture(stores!, fixtureOptions),

    async describeServices() {
      const { describeDataStores } = await import("./dataStoreGuard");
      return describeDataStores(stores!);
    },

    async dispose() {
      await stores?.close();
      stores = null;
    },
  };
}
