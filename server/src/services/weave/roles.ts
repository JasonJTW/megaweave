//* 某人在一筆 Weave 的身分（CONTEXT.md）：Giver／Receiver 看兩造欄位（ADR 0001），
//* Initiator 是兩造中不是 Post Author 的那一方，Reviewer 只在 Requested 有意義
import type { SqlExecutor } from "../postVisibility";
import { canReviewOrgRequest } from "../orgWeaveService";
import type { WeaveActorRoles } from "./transitions";
import type { WeaveStatus } from "./types";

export interface WeaveRoleFacts {
  status: WeaveStatus;
  giverId: number;
  receiverId: number;
  postAuthorId: number;
  postOrgId: number | null;
  postOrgUnitId: number | null;
}

export async function rolesOf(
  db: SqlExecutor,
  weave: WeaveRoleFacts,
  userId: number,
): Promise<WeaveActorRoles> {
  const isGiver = weave.giverId === userId;
  const isReceiver = weave.receiverId === userId;
  const isPostAuthor = weave.postAuthorId === userId;
  const isInitiator = (isGiver || isReceiver) && !isPostAuthor;
  let isReviewer = false;
  if (weave.status === "requested") {
    //* 組織 Post（ADR 0003/0004）：所屬單位的任一窗口、Org Admin 或 Platform Admin，依現在的身分判斷；
    //* 申請人（Receiver）自己不能審核
    isReviewer =
      weave.postOrgId != null && weave.postOrgUnitId != null
        ? !isReceiver &&
          (await canReviewOrgRequest(
            db,
            { orgId: Number(weave.postOrgId), orgUnitId: Number(weave.postOrgUnitId) },
            userId,
          ))
        : isPostAuthor;
  }
  return { isGiver, isReceiver, isInitiator, isReviewer };
}
