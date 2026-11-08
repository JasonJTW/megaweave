//* 組織物品服務共用的 4xx 錯誤（orgItemService、orgPendingPublicService 都用；放這裡避免循環 import）
import { HttpError } from "../utils/httpError";

export function unitNotManaged(): HttpError {
  return new HttpError(403, "ORG_UNIT_NOT_MANAGED", "You are not a Unit Contact of this unit");
}

export function tierNotAllowed(): HttpError {
  return new HttpError(403, "ORG_TIER_NOT_ALLOWED", "You cannot move this item to that tier");
}
