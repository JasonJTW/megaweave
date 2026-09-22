// server/src/benchmark/feed/feedProfile.ts
// feed-* profile：載入確定性 fixture，驗證 baseline 與現行策略回傳相同業務結果後，
// 以瀏覽器式 workload 經由公開 HTTP feed endpoint 分別量測 cold / warm cache 下的兩種策略。

import { RowDataPacket } from "mysql2";
import type { BenchmarkProfile, BenchmarkProfileOutcome } from "../profiles";
import type { AppStores } from "../fixture/fixtureProfile";
import { DEFAULT_FIXTURE_SEED } from "../fixture/generateFixture";
import { EMBEDDING_MODEL_VERSION } from "../fixture/embeddings";
import type { ComparisonPlan } from "./comparison";
import type { EquivalenceRequest } from "./equivalence";
import { FEED_PATH } from "./load";
import {
  FeedPersona,
  MAX_SCROLL_PAGES,
  personaKindFor,
  SCROLL_PROBABILITY,
  VIEW_MIX,
  WorkloadCatalog,
} from "./workload";

export const CACHE_RESET_PATH = "/benchmark/feed-caches/reset";

const CACHE_STATE_DEFINITION = {
  cold:
    "API in-process post/user vector caches are cleared immediately before measuring, with no warm-up. " +
    "MySQL buffer pool and OS page cache are not reset; the fixture fits in the buffer pool and stays warm from fixture loading.",
  warm: "API in-process caches are cleared, then the same strategy and workload run for the warm-up period before measuring.",
};

const UNAVAILABLE_METRICS = {
  "mysql.serverCpu": "not sampled: the runner does not read container or host metrics; use docker stats alongside the run",
  "mysql.serverMemory": "not sampled: see mysql.serverCpu",
  "redis.serverCpu": "not sampled: see mysql.serverCpu",
  "api.containerCpuAndMemory": "reported as API process CPU time and RSS/heap from /health, not container cgroup usage",
  "redis.cacheHitRateForFeed": "the feed path has no Redis result cache; keyspace hits/misses are reported per instance instead",
};

export interface FeedProfileOptions {
  name: string;
  posts: number;
  plan: Omit<ComparisonPlan, "seed">;
  seed?: number;
}

export async function resetTargetCaches(targetUrl: string): Promise<void> {
  const response = await fetch(new URL(CACHE_RESET_PATH, targetUrl), {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `Benchmark target cache reset failed with HTTP ${response.status}; start the API with BENCHMARK_TARGET_MARKER`,
    );
  }
}

export interface PreparedPersonas {
  personas: FeedPersona[];
  catalog: WorkloadCatalog;
  sessionIds: string[];
}

export async function preparePersonas(stores: AppStores, count: number): Promise<PreparedPersonas> {
  const { createBenchmarkSessions } = await import("./sessions");
  const selectUsers = async (withInterestVector: boolean) => {
    const [rows] = await stores.mysql.query<RowDataPacket[]>(
      `SELECT u.id, u.public_id, u.username, u.email, u.avatar_url, u.created_at
       FROM users u JOIN user_profiles up ON up.user_id = u.id
       WHERE up.interest_vector IS ${withInterestVector ? "NOT NULL" : "NULL"}
       ORDER BY u.id LIMIT ?`,
      [count],
    );
    return rows;
  };
  const [returningUsers, coldStartUsers, [locations], [categories]] = await Promise.all([
    selectUsers(true),
    selectUsers(false),
    stores.mysql.query<RowDataPacket[]>(
      "SELECT lat, lng FROM locations WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY id LIMIT ?",
      [count * 3],
    ),
    stores.mysql.query<RowDataPacket[]>(
      `SELECT DISTINCT category_id FROM posts
       WHERE status = 'active' AND deleted_at IS NULL AND category_id IS NOT NULL ORDER BY category_id`,
    ),
  ]);

  const personas: FeedPersona[] = [];
  const sessionUsers: RowDataPacket[] = [];
  const used = { returning: 0, "cold-start": 0, anonymous: 0 };
  for (let index = 0; index < count; index++) {
    const kind = personaKindFor(index);
    const ordinal = used[kind]++;
    const location = locations[index % locations.length];
    const coordinates = { lat: Number(location.lat), lng: Number(location.lng) };
    if (kind === "anonymous") {
      // 一半的訪客未授權定位，因此看到的是全站熱門 feed
      personas.push(ordinal % 2 === 0 ? { kind, coordinates } : { kind });
      continue;
    }
    const pool = kind === "returning" ? returningUsers : coldStartUsers;
    if (!pool[ordinal]) throw new Error(`Fixture has too few ${kind} users for ${count} virtual users`);
    sessionUsers.push(pool[ordinal] as RowDataPacket);
    personas.push({ kind, coordinates });
  }

  const sessionIds = await createBenchmarkSessions(
    stores.cacheRedis,
    sessionUsers.map((user) => ({
      id: Number(user.id),
      public_id: String(user.public_id),
      username: String(user.username),
      email: String(user.email),
      avatar_url: user.avatar_url ? String(user.avatar_url) : null,
      created_at: new Date(user.created_at),
    })),
  );
  let next = 0;
  for (const persona of personas) {
    if (persona.kind !== "anonymous") persona.sessionId = sessionIds[next++];
  }

  return {
    personas,
    catalog: { categoryIds: categories.map((row) => Number(row.category_id)) },
    sessionIds,
  };
}

/** 固定請求涵蓋每條 feed 路徑；兩種策略的回應必須完全一致才進入效能量測。 */
function buildEquivalenceRequests(personas: readonly FeedPersona[], catalog: WorkloadCatalog): EquivalenceRequest[] {
  const find = (predicate: (persona: FeedPersona) => boolean) => {
    const persona = personas.find(predicate);
    if (!persona) throw new Error("Feed equivalence check needs every persona kind");
    return persona;
  };
  const returning = find((p) => p.kind === "returning");
  const coldStart = find((p) => p.kind === "cold-start");
  const anonymousGeo = find((p) => p.kind === "anonymous" && Boolean(p.coordinates));
  const anonymous = find((p) => p.kind === "anonymous" && !p.coordinates);
  const geo = (persona: FeedPersona) => ({
    lat: String(persona.coordinates!.lat),
    lng: String(persona.coordinates!.lng),
  });
  const request = (
    name: string,
    requestClass: string,
    persona: FeedPersona,
    query: Record<string, string>,
    expectPersonalized = false,
  ): EquivalenceRequest => ({
    name,
    request: { requestClass, query, ...(persona.sessionId ? { sessionId: persona.sessionId } : {}) },
    ...(expectPersonalized ? { expectPersonalized } : {}),
  });

  return [
    request("returning user home page 1", "home-personalized", returning, { page: "1", limit: "12", ...geo(returning) }, true),
    request("returning user home page 3", "home-personalized", returning, { page: "3", limit: "12", ...geo(returning) }, true),
    request("returning user category filter", "filter-category", returning, {
      page: "1", limit: "12", category_id: String(catalog.categoryIds[0]), ...geo(returning),
    }, true),
    request("returning user type filter page 2", "filter-type", returning, { page: "2", limit: "12", type: "share", ...geo(returning) }, true),
    request("returning user tinder deck 15 km", "tinder", returning, {
      page: "1", limit: "50", mode: "tinder", radius: "15", ...geo(returning),
    }, true),
    request("cold-start user geo home", "home-geo", coldStart, { page: "1", limit: "12", ...geo(coldStart) }),
    request("anonymous geo home page 2", "home-geo", anonymousGeo, { page: "2", limit: "12", ...geo(anonymousGeo) }),
    request("anonymous trending home", "home-trending", anonymous, { page: "1", limit: "12" }),
  ];
}

/** 確認目標 API 讀取的是 runner 剛載入的 MySQL：回傳的貼文必須都是此資料庫中的 active 貼文。 */
async function assertTargetSharesMysql(stores: AppStores, postIds: number[]): Promise<void> {
  const ids = [...new Set(postIds)];
  const [[row]] = await stores.mysql.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM posts WHERE id IN (?) AND status = 'active' AND deleted_at IS NULL",
    [ids],
  );
  if (Number(row.count) !== ids.length) {
    throw new Error(
      "Benchmark target returned posts that are not active in the benchmark MySQL; start the API with server/benchmark.env",
    );
  }
}

export async function describeEnvironment(stores: AppStores) {
  const [variables] = await stores.mysql.query<RowDataPacket[]>(
    "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('innodb_buffer_pool_size', 'max_connections', 'performance_schema')",
  );
  const redisConfig = async (redis: AppStores["cacheRedis"]) => {
    try {
      return await redis.configGet(["maxmemory", "maxmemory-policy"]);
    } catch {
      return "unavailable: CONFIG GET is not permitted";
    }
  };
  return {
    mysql: Object.fromEntries(variables.map((v) => [String(v.Variable_name), String(v.Value)])),
    redisCache: await redisConfig(stores.cacheRedis),
    redisVector: await redisConfig(stores.vectorRedis),
    // runner 與 API 應使用同一份 benchmark.env；此值取自 runner 端
    apiDbConnectionLimitFromBenchmarkEnv: process.env.API_DB_CONNECTION_LIMIT ?? "unknown",
  };
}

export function createFeedProfile(options: FeedProfileOptions): BenchmarkProfile {
  const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
  const fixtureOptions = { posts: options.posts, seed };
  const plan: ComparisonPlan = { ...options.plan, seed };
  const maxVirtualUsers = Math.max(...plan.virtualUsers);
  let stores: AppStores | null = null;
  let sessionIds: string[] = [];

  return {
    name: options.name,
    description: `Compares full-hydration and late-materialization feed strategies over HTTP on a deterministic ${options.posts}-post fixture`,
    touchesTarget: true,
    workload: {
      operation: "feed-strategy-comparison",
      endpoint: `GET ${FEED_PATH}`,
      fixture: { ...fixtureOptions, embeddings: EMBEDDING_MODEL_VERSION },
      strategies: { baseline: "full-hydration", current: "late-materialization" },
      cacheStates: plan.cacheStates,
      cacheStateDefinition: CACHE_STATE_DEFINITION,
      virtualUsers: plan.virtualUsers,
      repetitions: plan.repetitions,
      warmUpSeconds: plan.warmUpMs / 1000,
      measureSeconds: plan.measureMs / 1000,
      thinkTimeSeconds: { min: plan.thinkTimeMs.min / 1000, max: plan.thinkTimeMs.max / 1000, distribution: "uniform" },
      requestMix: {
        personas: "per 10 virtual users: 5 returning (interest vector), 2 cold-start (no vector), 3 anonymous (half without location)",
        viewMix: Object.fromEntries(VIEW_MIX),
        scrollProbability: SCROLL_PROBABILITY,
        maxScrollPages: MAX_SCROLL_PAGES,
        pageSizes: { home: 12, tinder: 50 },
        excluded: "semantic search (requires query embeddings; measured by a separate search profile)",
      },
      executionOrder: "strategies alternate first position per repetition; API caches reset before every run",
      percentileMethod: "nearest-rank over successful requests; scenario value is the median across repetitions",
    },
    dependencies: { mysql: "benchmark", redis: "benchmark", openai: "mock" },

    async assertSafeToRun() {
      const { openAppStores } = await import("../fixture/fixtureProfile");
      const { assertBenchmarkDataStores, assertBenchmarkMysql } = await import("../fixture/dataStoreGuard");
      stores = await openAppStores();
      await assertBenchmarkMysql(stores.mysql);
      await stores.connectRedis();
      await assertBenchmarkDataStores(stores);
    },

    async run({ targetUrl }): Promise<BenchmarkProfileOutcome> {
      const target = targetUrl!;
      const activeStores = stores!;
      const { prepareFixture } = await import("../fixture/fixtureProfile");
      const { verifyStrategyEquivalence } = await import("./equivalence");
      const { evaluateInvariants, runComparison } = await import("./comparison");
      const { takeSnapshot } = await import("./observations");
      const { sessionCookieName } = await import("./sessions");
      const { renderFeedSummary } = await import("./summary");

      const fixture = await prepareFixture(activeStores, fixtureOptions);
      // fixture 重新載入後，API 記憶體中的向量快取已過期
      await resetTargetCaches(target);
      const prepared = await preparePersonas(activeStores, maxVirtualUsers);
      sessionIds = prepared.sessionIds;

      const equivalence = await verifyStrategyEquivalence({
        targetUrl: target,
        requests: buildEquivalenceRequests(prepared.personas, prepared.catalog),
        sessionCookieName: sessionCookieName(),
      });
      const fixtureChecks = (fixture.result.validation as { ok: boolean }[]) ?? [];
      const mismatches = equivalence.filter((check) => !check.ok);
      if (mismatches.length > 0) {
        // 業務結果不一致時不量測效能，但仍輸出 artifact 讓差異可供檢視
        return {
          dataset: fixture.dataset,
          result: { fixture: fixture.result, equivalence },
          invariants: [
            {
              name: "strategy-equivalence",
              ok: false,
              detail: `${mismatches.length} of ${equivalence.length} fixed requests differ; performance was not measured`,
            },
          ],
          summary: [
            "Baseline and current strategies returned different business results, so performance was not measured.",
            "",
            ...mismatches.map((check) => `- ${check.name}: ${check.detail}`),
          ].join("\n"),
        };
      }
      await assertTargetSharesMysql(activeStores, equivalence.flatMap((check) => check.postIds));

      const environment = await describeEnvironment(activeStores);
      const comparison = await runComparison({
        plan,
        targetUrl: target,
        personas: prepared.personas,
        catalog: prepared.catalog,
        sessionCookieName: sessionCookieName(),
        resetCaches: () => resetTargetCaches(target),
        takeSnapshot: () => takeSnapshot({ ...activeStores, targetUrl: target }),
      });

      const statementsAvailable = comparison.runs.every((run) => run.observations.mysql.statements !== null);
      return {
        dataset: fixture.dataset,
        result: {
          fixture: fixture.result,
          equivalence,
          environment,
          unavailableMetrics: {
            ...UNAVAILABLE_METRICS,
            ...(statementsAvailable
              ? {}
              : {
                  "mysql.statements":
                    "performance_schema is not readable by the benchmark user; run make benchmark-reset to apply the grant in server/db/benchmark-marker.sql",
                }),
          },
          scenarios: comparison.scenarios,
          runs: comparison.runs,
        },
        invariants: [
          {
            name: "strategy-equivalence",
            ok: true,
            detail: `${equivalence.length} fixed requests returned identical results`,
          },
          ...evaluateInvariants(comparison),
        ],
        summary: renderFeedSummary(comparison, equivalence, {
          passed: fixtureChecks.filter((check) => check.ok).length,
          total: fixtureChecks.length,
        }),
      };
    },

    async describeServices() {
      const { describeDataStores } = await import("../fixture/dataStoreGuard");
      return describeDataStores(stores!);
    },

    async dispose() {
      if (stores && sessionIds.length > 0) {
        const { deleteBenchmarkSessions } = await import("./sessions");
        await deleteBenchmarkSessions(stores.cacheRedis, sessionIds).catch(() => {});
      }
      sessionIds = [];
      await stores?.close();
      stores = null;
    },
  };
}
