import {
  compareStrategies,
  median,
  percentile,
  RequestSample,
  summarizeRun,
  summarizeScenario,
} from "./stats";

function sample(overrides: Partial<RequestSample> = {}): RequestSample {
  return {
    requestClass: "home-personalized",
    latencyMs: 10,
    status: 200,
    bytes: 1000,
    ...overrides,
  };
}

describe("feed benchmark statistics", () => {
  it("uses nearest-rank percentiles so every reported value is an observed latency", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);

    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 99)).toBe(99);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });

  it("takes the median of repetitions, averaging the middle pair for an even count", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("summarizes a run's latency, request rate, error rate, and response bytes", () => {
    const samples = [
      ...Array.from({ length: 18 }, (_, index) => sample({ latencyMs: index + 1 })),
      sample({ status: 500, latencyMs: 100, bytes: 50 }),
      sample({ status: 0, latencyMs: 30_000, bytes: 0, error: "timeout" }),
    ];

    const summary = summarizeRun(samples, 10_000);

    expect(summary).toMatchObject({
      requests: 20,
      errors: 2,
      errorRate: 0.1,
      requestRate: 2,
      // 錯誤請求不納入延遲分佈，以免 timeout 或快速失敗扭曲成功請求的延遲
      latencyMs: { count: 18, p50: 9, p95: 18, p99: 18, max: 18 },
      responseBytes: { total: 18_050, mean: 1000 },
    });
  });

  it("breaks a run down by request class", () => {
    const summary = summarizeRun(
      [
        sample({ requestClass: "tinder", latencyMs: 40 }),
        sample({ requestClass: "tinder", latencyMs: 20, status: 503 }),
        sample({ requestClass: "home-trending", latencyMs: 5 }),
      ],
      1000,
    );

    expect(summary.byRequestClass).toEqual({
      tinder: {
        requests: 2,
        errors: 1,
        latencyMs: { count: 1, p50: 40, p95: 40, p99: 40, mean: 40, max: 40 },
        meanResponseBytes: 1000,
      },
      "home-trending": {
        requests: 1,
        errors: 0,
        latencyMs: { count: 1, p50: 5, p95: 5, p99: 5, mean: 5, max: 5 },
        meanResponseBytes: 1000,
      },
    });
  });

  it("reports an empty run without inventing latencies", () => {
    expect(summarizeRun([], 1000)).toMatchObject({
      requests: 0,
      errorRate: 0,
      latencyMs: null,
      responseBytes: { total: 0, mean: null },
    });
  });

  it("reports the median of each metric across repetitions", () => {
    const runs = [
      summarizeRun([sample({ latencyMs: 10 }), sample({ latencyMs: 20 })], 1000),
      summarizeRun([sample({ latencyMs: 30 }), sample({ latencyMs: 40 })], 1000),
      summarizeRun([sample({ latencyMs: 50 }), sample({ latencyMs: 60, status: 500 })], 1000),
    ];

    expect(summarizeScenario(runs)).toEqual({
      repetitions: 3,
      medianLatencyMs: { p50: 30, p95: 40, p99: 40 },
      medianRequestRate: 2,
      medianErrorRate: 0,
      medianResponseBytes: 1000,
    });
  });

  it("expresses the current strategy relative to the baseline", () => {
    const baseline = {
      repetitions: 3,
      medianLatencyMs: { p50: 40, p95: 100, p99: 200 },
      medianRequestRate: 2,
      medianErrorRate: 0,
      medianResponseBytes: 1000,
    };
    const current = {
      ...baseline,
      medianLatencyMs: { p50: 30, p95: 60, p99: 250 },
    };

    expect(compareStrategies(baseline, current)).toEqual({
      p50ChangePercent: -25,
      p95ChangePercent: -40,
      p99ChangePercent: 25,
    });
  });
});
