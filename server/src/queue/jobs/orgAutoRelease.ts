// server/src/queue/jobs/orgAutoRelease.ts
// 職責：Auto Release 排程（#139）。規則都在 services/orgAutoReleaseService.ts，這裡只接 BullMQ
import type { Job } from "bullmq";
import { runAutoRelease } from "../../services/orgAutoReleaseService";

export async function processOrgAutoRelease(job: Job) {
  const result = await runAutoRelease(new Date());
  await job.log(`Checked ${result.checked} Internal items, released ${result.released}`);
  return result;
}
