// server/src/benchmark/queue/accounting.ts
// Queue burst 的工作帳目：以 BullMQ 事件串流（Redis 時鐘）重建每個 job 的生命週期，
// 確認每一筆送出的工作都落在 completed / 終止失敗 / 未完成 / 未觀測到其中之一，並計算等待與處理時間分佈。

import { LatencySummary, summarizeLatencies } from "../feed/stats";

export type JobOrigin = "burst" | "traffic";

export interface SubmittedJob {
  queue: string;
  jobId: string;
  origin: JobOrigin;
}

/** failed 只代表終止失敗；可重試的失敗會以下一次 active 呈現 */
export type JobEventType = "added" | "active" | "completed" | "failed" | "stalled";

export interface JobEvent {
  queue: string;
  jobId: string;
  type: JobEventType;
  /** 事件串流 ID 的毫秒時間戳 */
  atMs: number;
}

export type JobState = "completed" | "failed" | "unfinished" | "unobserved";

export interface JobRecord {
  queue: string;
  jobId: string;
  origin: JobOrigin;
  state: JobState;
  addedAtMs: number | null;
  finishedAtMs: number | null;
  attempts: number;
  stalls: number;
  /** 加入 queue 到第一次開始處理；包含 producer 設定的延遲 */
  queueWaitMs: number | null;
  /** 最後一次嘗試的處理時間 */
  processingMs: number | null;
  endToEndMs: number | null;
}

export interface QueueAccount {
  submitted: number;
  completed: number;
  terminalFailed: number;
  unfinished: number;
  unobserved: number;
  retriedJobs: number;
  /** 超過第一次的嘗試次數總和（含 stalled 後重新處理） */
  retries: number;
  stalls: number;
  queueWaitMs: LatencySummary | null;
  processingMs: LatencySummary | null;
  endToEndMs: LatencySummary | null;
  firstAddedAtMs: number | null;
  lastAddedAtMs: number | null;
  /** 所有工作皆終止後的最後完成時間；仍有未完成工作時為 null */
  lastTerminalAtMs: number | null;
  /** 最後一筆工作送入後到全部清空的時間，即停止送入後回到 zero backlog 的時間 */
  drainAfterLastSubmissionMs: number | null;
  /** 以第一筆送入到最後一筆終止的區間計算 */
  completedPerHour: number | null;
}

export interface OriginAccount {
  total: QueueAccount;
  byQueue: Record<string, QueueAccount>;
}

export interface JobAccounting {
  jobs: JobRecord[];
  byOrigin: Record<JobOrigin, OriginAccount>;
}

const TERMINAL: ReadonlySet<JobState> = new Set(["completed", "failed"]);
const jobKey = (queue: string, jobId: string) => `${queue}\u0000${jobId}`;

interface Lifecycle {
  addedAtMs: number | null;
  activeAtMs: number[];
  stalls: number;
  terminal: { state: "completed" | "failed"; atMs: number } | null;
}

function replay(events: readonly JobEvent[]): Map<string, Lifecycle> {
  const lifecycles = new Map<string, Lifecycle>();
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);
  for (const event of ordered) {
    const key = jobKey(event.queue, event.jobId);
    let lifecycle = lifecycles.get(key);
    if (!lifecycle) {
      lifecycle = { addedAtMs: null, activeAtMs: [], stalls: 0, terminal: null };
      lifecycles.set(key, lifecycle);
    }
    if (lifecycle.terminal) continue;
    switch (event.type) {
      case "added":
        lifecycle.addedAtMs ??= event.atMs;
        break;
      case "active":
        lifecycle.activeAtMs.push(event.atMs);
        break;
      case "stalled":
        lifecycle.stalls++;
        break;
      default:
        lifecycle.terminal = { state: event.type, atMs: event.atMs };
    }
  }
  return lifecycles;
}

function toRecord(job: SubmittedJob, lifecycle: Lifecycle | undefined): JobRecord {
  const added = lifecycle?.addedAtMs ?? null;
  const firstActive = lifecycle?.activeAtMs[0] ?? null;
  const lastActive = lifecycle?.activeAtMs.at(-1) ?? null;
  const finished = lifecycle?.terminal?.atMs ?? null;
  const state: JobState = lifecycle?.terminal?.state ?? (added === null && firstActive === null ? "unobserved" : "unfinished");
  return {
    ...job,
    state,
    addedAtMs: added,
    finishedAtMs: finished,
    attempts: lifecycle?.activeAtMs.length ?? 0,
    stalls: lifecycle?.stalls ?? 0,
    queueWaitMs: added !== null && firstActive !== null ? firstActive - added : null,
    processingMs: lastActive !== null && finished !== null ? finished - lastActive : null,
    endToEndMs: added !== null && finished !== null ? finished - added : null,
  };
}

const present = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
const maxOrNull = (values: number[]) => (values.length ? Math.max(...values) : null);
const minOrNull = (values: number[]) => (values.length ? Math.min(...values) : null);

function summarize(jobs: readonly JobRecord[]): QueueAccount {
  const count = (state: JobState) => jobs.filter((job) => job.state === state).length;
  const completed = count("completed");
  const added = present(jobs.map((job) => job.addedAtMs));
  const allTerminal = jobs.length > 0 && jobs.every((job) => TERMINAL.has(job.state));
  const lastTerminal = allTerminal ? maxOrNull(present(jobs.map((job) => job.finishedAtMs))) : null;
  const firstAdded = minOrNull(added);
  const lastAdded = maxOrNull(added);
  const spanMs = lastTerminal !== null && firstAdded !== null ? lastTerminal - firstAdded : null;

  return {
    submitted: jobs.length,
    completed,
    terminalFailed: count("failed"),
    unfinished: count("unfinished"),
    unobserved: count("unobserved"),
    retriedJobs: jobs.filter((job) => job.attempts > 1).length,
    retries: jobs.reduce((sum, job) => sum + Math.max(0, job.attempts - 1), 0),
    stalls: jobs.reduce((sum, job) => sum + job.stalls, 0),
    queueWaitMs: summarizeLatencies(present(jobs.map((job) => job.queueWaitMs))),
    processingMs: summarizeLatencies(present(jobs.map((job) => job.processingMs))),
    endToEndMs: summarizeLatencies(present(jobs.map((job) => job.endToEndMs))),
    firstAddedAtMs: firstAdded,
    lastAddedAtMs: lastAdded,
    lastTerminalAtMs: lastTerminal,
    drainAfterLastSubmissionMs: lastTerminal !== null && lastAdded !== null ? lastTerminal - lastAdded : null,
    completedPerHour: spanMs ? Math.round((completed / spanMs) * 3_600_000) : null,
  };
}

function summarizeOrigin(jobs: readonly JobRecord[]): OriginAccount {
  const queues = [...new Set(jobs.map((job) => job.queue))].sort();
  return {
    total: summarize(jobs),
    byQueue: Object.fromEntries(queues.map((queue) => [queue, summarize(jobs.filter((job) => job.queue === queue))])),
  };
}

/**
 * 以送出清單對照事件重建帳目。未在清單中、但事件串流中出現 added 的 job 歸為 traffic
 * （例如 API 建立貼文時排入的工作），不會被忽略。
 */
export function accountJobs(input: { submitted: readonly SubmittedJob[]; events: readonly JobEvent[] }): JobAccounting {
  const lifecycles = replay(input.events);
  const submittedKeys = new Set(input.submitted.map((job) => jobKey(job.queue, job.jobId)));
  const traffic: SubmittedJob[] = [];
  const seenTraffic = new Set<string>();
  for (const event of input.events) {
    const key = jobKey(event.queue, event.jobId);
    if (event.type !== "added" || submittedKeys.has(key) || seenTraffic.has(key)) continue;
    seenTraffic.add(key);
    traffic.push({ queue: event.queue, jobId: event.jobId, origin: "traffic" });
  }

  const jobs = [...input.submitted, ...traffic].map((job) =>
    toRecord(job, lifecycles.get(jobKey(job.queue, job.jobId))),
  );
  return {
    jobs,
    byOrigin: {
      burst: summarizeOrigin(jobs.filter((job) => job.origin === "burst")),
      traffic: summarizeOrigin(jobs.filter((job) => job.origin === "traffic")),
    },
  };
}
