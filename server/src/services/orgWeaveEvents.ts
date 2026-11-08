//* 組織物品 Weave 的狀態紀錄（#141，PRD 0001 §5.1 E9-1）：weaves 只存目前狀態，
//* 誰核可、誰婉拒、誰確認交接要另外記。每次狀態改變都在同一個交易裡寫一列 org_weave_events。
//* actorUserId 為 null 代表系統（降級、移除成員時的自動婉拒）。紀錄只新增，不改不刪
import type { Queryable } from "./orgService";

export const ORG_WEAVE_EVENT_ACTIONS = [
  "approved",
  "declined",
  "withdrawn",
  "cancelled",
  "confirmed",
  "completed",
] as const;
export type OrgWeaveEventAction = (typeof ORG_WEAVE_EVENT_ACTIONS)[number];

export interface OrgWeaveEventInput {
  weaveId: number;
  postId: number;
  orgId: number;
  action: OrgWeaveEventAction;
  actorUserId: number | null;
}

export async function recordOrgWeaveEvents(
  db: Pick<Queryable, "query">,
  events: OrgWeaveEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  await db.query(
    "INSERT INTO org_weave_events (weave_id, post_id, org_id, action, actor_user_id) VALUES ?",
    [events.map((e) => [e.weaveId, e.postId, e.orgId, e.action, e.actorUserId])],
  );
}
