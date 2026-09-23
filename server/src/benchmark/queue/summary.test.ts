import { accountJobs } from "./accounting";
import { summarizeBacklog } from "./backlog";
import { evaluateConsistency } from "./consistency";
import { summarizeTrafficPhases } from "./phases";
import { renderQueueBurstSummary } from "./summary";

describe("queue burst summary", () => {
  it("states the benchmark conditions and reports capacity, user impact, and consistency", () => {
    const accounting = accountJobs({
      submitted: [{ queue: "post-embedding", jobId: "1", origin: "burst" }],
      events: [
        { queue: "post-embedding", jobId: "1", type: "added", atMs: 0 },
        { queue: "post-embedding", jobId: "1", type: "active", atMs: 600 },
        { queue: "post-embedding", jobId: "1", type: "completed", atMs: 900 },
      ],
    });
    const phases = summarizeTrafficPhases(
      [
        { group: "feed", requestClass: "home-geo", startedAtMs: 0, latencyMs: 40, status: 200, bytes: 10 },
        { group: "feed", requestClass: "home-geo", startedAtMs: 10_000, latencyMs: 60, status: 200, bytes: 10 },
      ],
      [
        { name: "before", startMs: 0, endMs: 10_000 },
        { name: "burst", startMs: 10_000, endMs: 20_000 },
      ],
    );

    const summary = renderQueueBurstSummary({
      units: 1,
      stagedImagesByVariant: { "client-webp": 1, raw: 2 },
      accounting,
      backlog: summarizeBacklog([], { injectionStartedAtMs: 0, injectionEndedAtMs: 0 }),
      timeToZeroBacklogMs: 900,
      phases,
      consistency: evaluateConsistency(
        { posts: [], userVectors: [], userVectorsUpdatedSinceMs: 0 },
        {
          embeddings: new Map(),
          imageKeysByPost: new Map(),
          storage: { uploadsByKey: new Map(), remainingStagingKeys: new Set() },
          userVectorUpdatedAtMs: new Map(),
        },
      ),
      queueConcurrency: { "post-embedding": 2 },
      workerConnections: { "post-embedding": 1 },
    });

    expect(summary).toContain("not an observation of production traffic");
    expect(summary).toContain("Time to zero backlog after the last enqueue: 0.9 s");
    expect(summary).toContain("| post-embedding | 1 | 1 | 0 | 0 | 0 (0 jobs) | 600 / 600 / 600 ms | 300 / 300 / 300 ms |");
    expect(summary).toContain("| 2 × 1 |");
    expect(summary).toContain("Staged burst images by source: client-webp 1, raw 2.");
    expect(summary).toContain("| burst (10.0 s) | Feed | 1 | 0.00% | 60 ms | 60 ms | 60 ms | +50% |");
    expect(summary).toContain("- PASS embeddings-persisted: 0/0");
    expect(summary).toContain("Note: fewer than 100 successful requests for feed in before, post creation in before");
  });
});
