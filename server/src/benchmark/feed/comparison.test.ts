import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { ComparisonPlan, evaluateInvariants, runComparison } from "./comparison";
import type { ResourceSnapshot } from "./observations";
import type { FeedPersona } from "./workload";

const personas: FeedPersona[] = [
  { kind: "returning", sessionId: "s1", coordinates: { lat: 25, lng: 121 } },
  { kind: "anonymous" },
];

const plan: ComparisonPlan = {
  seed: 1,
  cacheStates: ["cold", "warm"],
  virtualUsers: [1, 2],
  repetitions: 2,
  warmUpMs: 60,
  measureMs: 120,
  thinkTimeMs: { min: 5, max: 10 },
};

const emptySnapshot = (): ResourceSnapshot => ({
  atMs: performance.now(),
  mysqlStatus: {},
  mysqlStatements: null,
  redis: { cache: {}, vector: {} },
  api: {},
});

describe("feed strategy comparison", () => {
  let server: Server;
  let targetUrl: string;
  let events: string[];

  beforeEach(async () => {
    events = [];
    server = createServer((req, res) => {
      const strategy = String(req.headers["x-benchmark-feed-strategy"]);
      events.push(`request ${strategy}`);
      res.writeHead(200, { "x-benchmark-feed-strategy": strategy });
      // baseline 回應較慢，讓比較結果可預期
      setTimeout(() => res.end("{}"), strategy === "full-hydration" ? 8 : 1);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    targetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const run = () =>
    runComparison({
      plan,
      targetUrl,
      personas,
      catalog: { categoryIds: [1] },
      sessionCookieName: "session-id",
      resetCaches: async () => {
        events.push("reset");
      },
      takeSnapshot: async () => {
        events.push("snapshot");
        return emptySnapshot();
      },
      log: () => {},
    });

  it("runs every cache state, concurrency, repetition, and strategy, retaining each raw repetition", async () => {
    const result = await run();

    // 2 cache states × 2 VU levels × 2 repetitions × 2 strategies
    expect(result.runs).toHaveLength(16);
    expect(result.runs[0]).toMatchObject({
      cacheState: "cold",
      virtualUsers: 1,
      repetition: 1,
      strategy: "full-hydration",
      strategyMismatches: 0,
      summary: { errors: 0 },
    });
    expect(result.runs[0].latenciesMs.length).toBe(result.runs[0].summary.requests);
    expect(result.scenarios).toHaveLength(4);
    expect(result.scenarios[0]).toMatchObject({
      cacheState: "cold",
      virtualUsers: 1,
      baseline: { repetitions: 2 },
      current: { repetitions: 2 },
      currentVsBaseline: { p50ChangePercent: expect.any(Number) },
    });
    expect(result.scenarios[0].currentVsBaseline.p50ChangePercent!).toBeLessThan(0);
  });

  it("alternates which strategy runs first so drift does not favour one strategy", async () => {
    const result = await run();

    const order = result.runs
      .filter((r) => r.cacheState === "cold" && r.virtualUsers === 1)
      .map((r) => `${r.repetition}:${r.strategy}`);
    expect(order).toEqual([
      "1:full-hydration",
      "1:late-materialization",
      "2:late-materialization",
      "2:full-hydration",
    ]);
  });

  it("resets API caches before every run and warms up only warm-cache runs", async () => {
    const result = await run();

    const coldRun = events.slice(0, events.indexOf("snapshot"));
    expect(coldRun).toEqual(["reset"]);

    const firstWarm = result.runs.findIndex((r) => r.cacheState === "warm");
    const resets = events.reduce<number[]>((indexes, event, index) => (event === "reset" ? [...indexes, index] : indexes), []);
    const warmRunEvents = events.slice(resets[firstWarm], events.indexOf("snapshot", resets[firstWarm]));
    // warm-up 期間的請求發生在量測快照之前，且不計入結果
    expect(warmRunEvents.filter((e) => e.startsWith("request")).length).toBeGreaterThan(0);
    expect(result.runs[firstWarm].warmUpRequests).toBeGreaterThan(0);
    expect(result.runs[0].warmUpRequests).toBe(0);
  });

  it("fails invariants for HTTP errors, ignored strategies, and candidate vector read failures", async () => {
    const result = await run();
    expect(evaluateInvariants(result).every((invariant) => invariant.ok)).toBe(true);

    result.runs[3].summary.errors = 2;
    result.runs[5].strategyMismatches = 1;
    result.runs[6].observations.feedCaches.candidateVectorReadFailures = 4;

    expect(evaluateInvariants(result)).toEqual([
      { name: "no-http-errors", ok: false, detail: expect.stringContaining("2 failed requests") },
      { name: "requested-strategy-applied", ok: false, detail: expect.stringContaining("1 response") },
      { name: "no-candidate-vector-read-failures", ok: false, detail: expect.stringContaining("4 failed") },
    ]);
  });
});
