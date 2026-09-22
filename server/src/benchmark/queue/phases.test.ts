import { summarizeTrafficPhases, TrafficSample } from "./phases";

const sample = (group: TrafficSample["group"], startedAtMs: number, latencyMs: number, status = 200): TrafficSample => ({
  group,
  requestClass: group === "feed" ? "home-geo" : "post-create",
  startedAtMs,
  latencyMs,
  status,
  bytes: 100,
});

describe("traffic phase summary", () => {
  const phases = [
    { name: "before", startMs: 0, endMs: 10_000 },
    { name: "burst", startMs: 10_000, endMs: 30_000 },
    { name: "after", startMs: 30_000, endMs: 40_000 },
  ];

  it("assigns requests to the phase in which they started and summarizes each traffic group", () => {
    const result = summarizeTrafficPhases(
      [
        sample("feed", 1_000, 20),
        sample("feed", 9_999, 30),
        sample("feed", 10_000, 90),
        sample("feed", 29_000, 110, 503),
        sample("post-creation", 12_000, 250),
        sample("feed", 35_000, 25),
        // 超出所有 phase 的請求不列入
        sample("feed", 41_000, 999),
      ],
      phases,
    );

    expect(result.map((phase) => phase.name)).toEqual(["before", "burst", "after"]);
    expect(result[0].durationMs).toBe(10_000);
    expect(result[0].groups.feed).toMatchObject({ requests: 2, errors: 0, latencyMs: { p50: 20, max: 30 } });
    expect(result[1].groups.feed).toMatchObject({ requests: 2, errors: 1, errorRate: 0.5, latencyMs: { count: 1, p50: 90 } });
    expect(result[1].groups["post-creation"]).toMatchObject({ requests: 1, requestRate: 0.05 });
    expect(result[0].groups["post-creation"]).toMatchObject({ requests: 0, latencyMs: null });
    expect(result[2].groups.feed).toMatchObject({ requests: 1 });
  });

  it("reports each phase's p95 change against the phase before the burst", () => {
    const result = summarizeTrafficPhases(
      [sample("feed", 0, 100), sample("feed", 15_000, 150), sample("feed", 35_000, 90)],
      phases,
    );

    expect(result[0].p95ChangeVsBeforePercent.feed).toBe(0);
    expect(result[1].p95ChangeVsBeforePercent.feed).toBe(50);
    expect(result[2].p95ChangeVsBeforePercent.feed).toBe(-10);
    expect(result[1].p95ChangeVsBeforePercent["post-creation"]).toBeNull();
  });
});
