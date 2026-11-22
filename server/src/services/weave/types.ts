import type { ErrorCode } from "../../utils/errorCodes";
import { HttpError } from "../../utils/httpError";

export class WeaveError extends HttpError {
  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    params?: Record<string, string | number>,
  ) {
    super(statusCode, code, message, params);
    this.name = "WeaveError";
  }

  get httpStatus() {
    return this.statusCode;
  }
}

export type WeaveStatus =
  | "approved"
  | "requested"
  | "declined"
  | "cancelled"
  | "withdrawn"
  | "completed";

/** 物品流向：Giver 流出、Receiver 流入（CONTEXT.md、ADR 0001） */
export type WeaveRole = "giver" | "receiver";
