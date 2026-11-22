//* Weave module：一次物品交換的完整關係（CONTEXT.md「交換」「Weave 狀態」）。
//* 呼叫端只透過這裡：建立請求、下命令、系統婉拒、讀取（附上看的人能做什麼）
export { WeaveError, type WeaveRole, type WeaveStatus } from "./types";
export {
  WEAVE_COMMANDS,
  commandForTargetStatus,
  type WeaveCommand,
} from "./transitions";
export {
  actOnWeave,
  declineAsSystem,
  listActingUnits,
  requestWeave,
  type ActOnWeaveParams,
  type ActOnWeaveResult,
  type RequestWeaveParams,
  type RequestWeaveResult,
} from "./lifecycle";
export { announceAutoDeclined, type AutoDeclinedWeave, type WeaveActionType } from "./effects";
export {
  WEAVE_QUERY_BASE,
  processWeaveRows,
  type ProcessWeaveRowsOptions,
  type WeaveItemRow,
  type WeaveOutput,
  type WeaveViewer,
} from "./readModel";
