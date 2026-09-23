import { DepthSample, summarizeBacklog } from "./backlog";

const sample = (atMs: number, embedding: number, image = 0): DepthSample => ({
  atMs,
  byQueue: {
    "post-embedding": { waiting: embedding, delayed: 0, prioritized: 0, active: 0 },
    "post-image": { waiting: 0, delayed: image, prioritized: 0, active: 0 },
  },
});

describe("queue backlog summary", () => {
  it("reports the peak unfinished depth per queue and across queues", () => {
    const summary = summarizeBacklog([sample(0, 0), sample(1_000, 40, 10), sample(2_000, 60, 0), sample(3_000, 5, 30)], {
      injectionStartedAtMs: 0,
      injectionEndedAtMs: 1_500,
    });

    expect(summary.peak).toEqual({ depth: 60, atOffsetMs: 2_000 });
    expect(summary.peakByQueue).toEqual({
      "post-embedding": { depth: 60, atOffsetMs: 2_000 },
      "post-image": { depth: 30, atOffsetMs: 3_000 },
    });
  });

  it("counts waiting, delayed, prioritized, and active jobs as backlog", () => {
    const summary = summarizeBacklog(
      [
        {
          atMs: 0,
          byQueue: { "user-vector": { waiting: 1, delayed: 2, prioritized: 3, active: 4 } },
        },
      ],
      { injectionStartedAtMs: 0, injectionEndedAtMs: 0 },
    );

    expect(summary.peak.depth).toBe(10);
  });

  it("measures the first sampled zero backlog after injection stops", () => {
    const summary = summarizeBacklog(
      [sample(0, 0), sample(1_000, 20), sample(2_000, 0), sample(3_000, 8), sample(4_000, 2), sample(5_000, 0)],
      { injectionStartedAtMs: 500, injectionEndedAtMs: 2_500 },
    );

    // 2_000 的 0 發生在送入結束之前，不算回到 zero backlog
    expect(summary.firstZeroAfterInjectionMs).toBe(2_500);
  });

  it("reports null when the backlog never returned to zero", () => {
    const summary = summarizeBacklog([sample(0, 3), sample(1_000, 1)], {
      injectionStartedAtMs: 0,
      injectionEndedAtMs: 0,
    });

    expect(summary.firstZeroAfterInjectionMs).toBeNull();
  });
});
