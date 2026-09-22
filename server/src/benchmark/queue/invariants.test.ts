import { accountJobs, JobEvent, SubmittedJob } from "./accounting";
import { ConsistencyResult } from "./consistency";
import { evaluateQueueBurstInvariants, QueueBurstInvariantInput } from "./invariants";
import { summarizeTrafficPhases, TrafficSample } from "./phases";

const lifecycle = (queue: string, jobId: string, end: "completed" | "failed" | null): JobEvent[] => [
  { queue, jobId, type: "added", atMs: 0 },
  { queue, jobId, type: "active", atMs: 1 },
  ...(end ? [{ queue, jobId, type: end, atMs: 2 } as JobEvent] : []),
];
const burstJob = (queue: string, jobId: string): SubmittedJob => ({ queue, jobId, origin: "burst" });

const passingConsistency: ConsistencyResult = {
  checks: [{ name: "embeddings-persisted", expected: 1, actual: 1, ok: true, missing: [] }],
  duplicateUploads: 0,
  effectsNotExpected: { "post-embedding": 0, "post-images": 0, "user-vector": 0 },
};

const sample = (group: TrafficSample["group"], startedAtMs: number, status = 200): TrafficSample => ({
  group,
  requestClass: group === "feed" ? "home-geo" : "post-create",
  startedAtMs,
  latencyMs: 10,
  status,
  bytes: 1,
});
const phaseWindows = [
  { name: "before", startMs: 0, endMs: 10 },
  { name: "burst", startMs: 10, endMs: 20 },
];
const everyPhaseSamples = [sample("feed", 0), sample("post-creation", 1), sample("feed", 10), sample("post-creation", 11)];

function input(overrides: Partial<QueueBurstInvariantInput> = {}): QueueBurstInvariantInput {
  return {
    plannedJobs: 3,
    deduplicated: 0,
    drained: true,
    drainTimeoutMs: 60_000,
    accounting: accountJobs({
      submitted: [burstJob("post-image", "1"), burstJob("post-embedding", "1"), burstJob("user-vector", "1")],
      events: [...lifecycle("post-image", "1", "completed"), ...lifecycle("post-embedding", "1", "completed"), ...lifecycle("user-vector", "1", "completed")],
    }),
    consistency: passingConsistency,
    phases: summarizeTrafficPhases(everyPhaseSamples, phaseWindows),
    samples: everyPhaseSamples,
    ...overrides,
  };
}

const failed = (invariants: ReturnType<typeof evaluateQueueBurstInvariants>) =>
  invariants.filter((invariant) => !invariant.ok).map((invariant) => invariant.name);

describe("queue burst invariants", () => {
  it("passes when all work is accounted, consistent, and traffic was served in every phase", () => {
    expect(failed(evaluateQueueBurstInvariants(input()))).toEqual([]);
  });

  it("fails accounting when the producer deduplicated a planned job", () => {
    const result = evaluateQueueBurstInvariants(
      input({
        deduplicated: 1,
        accounting: accountJobs({
          submitted: [burstJob("post-image", "1"), burstJob("post-embedding", "1")],
          events: [...lifecycle("post-image", "1", "completed"), ...lifecycle("post-embedding", "1", "completed")],
        }),
      }),
    );
    expect(failed(result)).toEqual(["burst-work-accounted"]);
  });

  it("fails accounting when a burst job never reached a terminal state before the drain timeout", () => {
    const result = evaluateQueueBurstInvariants(
      input({
        drained: false,
        accounting: accountJobs({
          submitted: [burstJob("post-image", "1"), burstJob("post-embedding", "1"), burstJob("user-vector", "1")],
          events: [...lifecycle("post-image", "1", "completed"), ...lifecycle("post-embedding", "1", null)],
        }),
      }),
    );
    expect(failed(result)).toEqual(["burst-work-accounted"]);
    expect(result.find((i) => i.name === "burst-work-accounted")?.detail).toContain("1 unfinished and 1 never observed");
  });

  it("fails when jobs enqueued by the API traffic did not finish", () => {
    const result = evaluateQueueBurstInvariants(
      input({
        accounting: accountJobs({
          submitted: [burstJob("post-image", "1"), burstJob("post-embedding", "1"), burstJob("user-vector", "1")],
          events: [
            ...lifecycle("post-image", "1", "completed"),
            ...lifecycle("post-embedding", "1", "completed"),
            ...lifecycle("user-vector", "1", "completed"),
            ...lifecycle("post-embedding", "api-7", null),
          ],
        }),
      }),
    );
    expect(failed(result)).toEqual(["traffic-work-accounted"]);
  });

  it("fails on terminal failures from burst or traffic jobs", () => {
    const result = evaluateQueueBurstInvariants(
      input({
        accounting: accountJobs({
          submitted: [burstJob("post-image", "1"), burstJob("post-embedding", "1"), burstJob("user-vector", "1")],
          events: [
            ...lifecycle("post-image", "1", "failed"),
            ...lifecycle("post-embedding", "1", "completed"),
            ...lifecycle("user-vector", "1", "completed"),
          ],
        }),
      }),
    );
    expect(failed(result)).toEqual(["no-terminal-failures"]);
  });

  it("fails when a durable effect is missing", () => {
    const result = evaluateQueueBurstInvariants(
      input({
        consistency: {
          ...passingConsistency,
          checks: [{ name: "images-processed", expected: 2, actual: 1, ok: false, missing: ["post 1: x not uploaded"] }],
        },
      }),
    );
    expect(failed(result)).toEqual(["durable-effects-consistent"]);
  });

  it("fails when a traffic group was not served during a phase, and on any failed request", () => {
    const samples = [sample("feed", 0), sample("post-creation", 1), sample("feed", 10, 503)];
    const result = evaluateQueueBurstInvariants(input({ samples, phases: summarizeTrafficPhases(samples, phaseWindows) }));
    expect(failed(result)).toEqual(["traffic-throughout-burst", "no-http-errors"]);
    expect(result.find((i) => i.name === "traffic-throughout-burst")?.detail).toContain("feed in burst, post-creation in burst");
  });
});
