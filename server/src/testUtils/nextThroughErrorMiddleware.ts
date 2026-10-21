import { Request, Response } from "express";
import { errorMiddleware } from "../utils/errorHandler";

//* 直接呼叫 route handler 的測試用：handler `next(error)` 時交給真正的 errorMiddleware 寫入 mock res，
//* 讓斷言仍然停在 HTTP 回應（status / body）；`next()` 不帶參數代表放行
export function nextThroughErrorMiddleware(res: Response) {
  const req = { method: "TEST", originalUrl: "" } as Request;
  return jest.fn((error?: unknown) => {
    if (error !== undefined) errorMiddleware(error, req, res, jest.fn());
  });
}
