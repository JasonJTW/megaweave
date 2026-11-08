// server/src/queue/jobs/orgPendingPublic.ts
// 職責：待公開到期排程（#140）。規則都在 services/orgPendingPublicService.ts，這裡只接 BullMQ
import type { Job } from "bullmq";
import { runPendingPublic } from "../../services/orgPendingPublicService";

export async function processOrgPendingPublic(job: Job) {
  const result = await runPendingPublic(new Date());
  if (result.published > 0) await job.log(`Published ${result.published} pending items`);
  return result;
}
