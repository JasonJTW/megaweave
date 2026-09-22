import { accountJobs, JobEvent, SubmittedJob } from "./accounting";

const submitted = (queue: string, jobId: string): SubmittedJob => ({ queue, jobId, origin: "burst" });
const event = (queue: string, jobId: string, type: JobEvent["type"], atMs: number): JobEvent => ({
  queue,
  jobId,
  type,
  atMs,
});

describe("queue job accounting", () => {
  it("accounts every submitted job as completed, terminally failed, unfinished, or never observed", () => {
    const result = accountJobs({
      submitted: [
        submitted("post-embedding", "1"),
        submitted("post-embedding", "2"),
        submitted("post-embedding", "3"),
        submitted("post-embedding", "4"),
      ],
      events: [
        event("post-embedding", "1", "added", 0),
        event("post-embedding", "1", "active", 100),
        event("post-embedding", "1", "completed", 300),
        event("post-embedding", "2", "added", 10),
        event("post-embedding", "2", "active", 150),
        event("post-embedding", "2", "failed", 200),
        event("post-embedding", "3", "added", 20),
        event("post-embedding", "3", "active", 400),
      ],
    });

    const embedding = result.byOrigin.burst.byQueue["post-embedding"];
    expect(embedding).toMatchObject({
      submitted: 4,
      completed: 1,
      terminalFailed: 1,
      unfinished: 1,
      unobserved: 1,
    });
    expect(embedding.completed + embedding.terminalFailed + embedding.unfinished + embedding.unobserved).toBe(
      embedding.submitted,
    );
    expect(result.jobs.map((job) => [job.jobId, job.state])).toEqual([
      ["1", "completed"],
      ["2", "failed"],
      ["3", "unfinished"],
      ["4", "unobserved"],
    ]);
  });

  it("measures queue wait from enqueue to first start and processing from last start to finish", () => {
    const result = accountJobs({
      submitted: [submitted("post-image", "a"), submitted("post-image", "b")],
      events: [
        event("post-image", "a", "added", 1_000),
        event("post-image", "a", "active", 1_250),
        event("post-image", "a", "completed", 1_400),
        event("post-image", "b", "added", 1_000),
        // 第一次嘗試失敗後退避重試；processing 只算最後一次嘗試
        event("post-image", "b", "active", 1_100),
        event("post-image", "b", "active", 3_100),
        event("post-image", "b", "completed", 3_600),
      ],
    });

    const [a, b] = result.jobs;
    expect(a).toMatchObject({ queueWaitMs: 250, processingMs: 150, endToEndMs: 400, attempts: 1 });
    expect(b).toMatchObject({ queueWaitMs: 100, processingMs: 500, endToEndMs: 2_600, attempts: 2 });

    const image = result.byOrigin.burst.byQueue["post-image"];
    expect(image.retriedJobs).toBe(1);
    expect(image.retries).toBe(1);
    expect(image.queueWaitMs).toMatchObject({ count: 2, p50: 100, p95: 250, max: 250 });
    expect(image.processingMs).toMatchObject({ count: 2, p50: 150, p95: 500 });
  });

  it("counts stalls separately from retries", () => {
    const result = accountJobs({
      submitted: [submitted("user-vector", "s")],
      events: [
        event("user-vector", "s", "added", 0),
        event("user-vector", "s", "active", 10),
        event("user-vector", "s", "stalled", 30_000),
        event("user-vector", "s", "active", 30_010),
        event("user-vector", "s", "completed", 30_050),
      ],
    });

    expect(result.byOrigin.burst.byQueue["user-vector"]).toMatchObject({ stalls: 1, retries: 1, completed: 1 });
  });

  it("classifies jobs it did not submit as traffic work instead of dropping them", () => {
    const result = accountJobs({
      submitted: [submitted("post-embedding", "burst-1")],
      events: [
        event("post-embedding", "burst-1", "added", 0),
        event("post-embedding", "burst-1", "active", 5),
        event("post-embedding", "burst-1", "completed", 10),
        event("post-embedding", "api-1", "added", 3),
        event("post-embedding", "api-1", "active", 8),
        event("post-embedding", "api-1", "completed", 12),
      ],
    });

    expect(result.byOrigin.burst.total.submitted).toBe(1);
    expect(result.byOrigin.traffic.byQueue["post-embedding"]).toMatchObject({ submitted: 1, completed: 1 });
  });

  it("keeps job ids of different queues apart", () => {
    const result = accountJobs({
      submitted: [submitted("post-image", "1"), submitted("post-embedding", "1")],
      events: [
        event("post-image", "1", "added", 0),
        event("post-image", "1", "active", 1),
        event("post-image", "1", "completed", 2),
        event("post-embedding", "1", "added", 0),
      ],
    });

    expect(result.byOrigin.burst.byQueue["post-image"].completed).toBe(1);
    expect(result.byOrigin.burst.byQueue["post-embedding"].unfinished).toBe(1);
  });

  it("reports drain time from the last submission to the last terminal job and completed throughput", () => {
    const result = accountJobs({
      submitted: [submitted("post-embedding", "1"), submitted("post-embedding", "2"), submitted("user-vector", "3")],
      events: [
        event("post-embedding", "1", "added", 0),
        event("post-embedding", "2", "added", 1_000),
        event("user-vector", "3", "added", 2_000),
        event("post-embedding", "1", "active", 100),
        event("post-embedding", "1", "completed", 1_000),
        event("user-vector", "3", "active", 2_100),
        event("user-vector", "3", "completed", 2_500),
        event("post-embedding", "2", "active", 3_000),
        event("post-embedding", "2", "completed", 6_000),
      ],
    });

    const burst = result.byOrigin.burst;
    expect(burst.total).toMatchObject({
      submitted: 3,
      completed: 3,
      firstAddedAtMs: 0,
      lastAddedAtMs: 2_000,
      lastTerminalAtMs: 6_000,
      drainAfterLastSubmissionMs: 4_000,
    });
    expect(burst.byQueue["post-embedding"]).toMatchObject({
      completedPerHour: 1_200,
      drainAfterLastSubmissionMs: 5_000,
    });
  });

  it("leaves drain time unknown while any submitted job is unfinished", () => {
    const result = accountJobs({
      submitted: [submitted("post-embedding", "1")],
      events: [event("post-embedding", "1", "added", 0), event("post-embedding", "1", "active", 5)],
    });

    expect(result.byOrigin.burst.total.drainAfterLastSubmissionMs).toBeNull();
    expect(result.byOrigin.burst.total.lastTerminalAtMs).toBeNull();
  });

  it("ignores events that arrive after a job is already terminal", () => {
    const result = accountJobs({
      submitted: [submitted("post-image", "1")],
      events: [
        event("post-image", "1", "added", 0),
        event("post-image", "1", "active", 1),
        event("post-image", "1", "completed", 2),
        event("post-image", "1", "failed", 3),
      ],
    });

    expect(result.jobs[0]).toMatchObject({ state: "completed", finishedAtMs: 2 });
  });
});
