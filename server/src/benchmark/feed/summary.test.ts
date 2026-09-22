import type { ComparisonResult, RunRecord, ScenarioRecord } from "./comparison";
import { renderFeedSummary } from "./summary";

const work = { mysqlQueries: 3, mysqlInnodbRowsRead: 1200, mysqlBytesSent: 20000, redisVectorCommands: 4, apiCpuMs: 8 };
const scenario: ScenarioRecord = {
  cacheState: "warm",
  virtualUsers: 10,
  baseline: {
    repetitions: 3,
    medianLatencyMs: { p50: 40, p95: 200, p99: 300 },
    medianRequestRate: 1.8,
    medianErrorRate: 0,
    medianResponseBytes: 21000,
  },
  current: {
    repetitions: 3,
    medianLatencyMs: { p50: 20, p95: 50, p99: 90 },
    medianRequestRate: 1.8,
    medianErrorRate: 0,
    medianResponseBytes: 21000,
  },
  currentVsBaseline: { p50ChangePercent: -50, p95ChangePercent: -75, p99ChangePercent: -70 },
  medianPerRequest: { "full-hydration": work, "late-materialization": work },
};

const run = (count: number) => ({ summary: { latencyMs: { count } } }) as unknown as RunRecord;

describe("feed benchmark summary", () => {
  it("tabulates both strategies and the relative change for each scenario", () => {
    const result: ComparisonResult = { scenarios: [scenario], runs: [run(400), run(400)] };

    const summary = renderFeedSummary(result, [{ name: "home", requestClass: "home-personalized", ok: true, postIds: [1] }], {
      passed: 18,
      total: 18,
    });

    expect(summary).toContain("### Warm cache");
    expect(summary).toContain("| 10 | baseline | 40 ms | 200 ms | 300 ms | 1.8 | 0.00% | 21000 |");
    expect(summary).toContain("| 10 | change | -50% | -75% | -70% | | | |");
    expect(summary).toContain("Strategy equivalence: 1/1");
    expect(summary).toContain("not an observation of production traffic");
    expect(summary).not.toContain("fewer than 100");
  });

  it("warns when runs are too small for p99 to be meaningful", () => {
    const summary = renderFeedSummary({ scenarios: [scenario], runs: [run(30), run(400)] }, [], { passed: 0, total: 0 });

    expect(summary).toContain("1 of 2 runs have fewer than 100 successful requests");
  });
});
