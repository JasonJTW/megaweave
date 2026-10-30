import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ErrorCode } from "./errorCodes";
import { HttpError } from "./httpError";

//* Express error-handling middleware（4 個參數才會被 Express 辨識為 error handler）
//* 路由 catch 裡 `return next(error)`，由這裡統一處理
export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  //* response 已經開始送出，交還給 Express 預設 handler 關閉連線
  if (res.headersSent) return next(error);

  //* 可預期錯誤：照 HttpError 的 status / code 回應
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      code: error.code,
      errorMessage: error.message,
      ...(error.params && { params: error.params }),
    });
  }

  //* Zod error
  if (error instanceof z.ZodError) {
    console.log("Zod error:", error.issues[0]?.message || "Validation failed");
    console.log(`--------`);
    return res.status(400).json({
      code: "VALIDATION_FAILED" satisfies ErrorCode,
      errorMessage: error.issues[0]?.message || "Validation failed",
      errorDetails: error.issues,
    });
  }

  //* internal server error
  let errorMessage = "Internal server error";
  let errorDetails: string;
  let statusCode = 500;
  let code: ErrorCode = "INTERNAL_ERROR";

  if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || error.message;

    //* MySQL error
    if ("code" in error) {
      switch (error.code) {
        case "ER_DUP_ENTRY":
          statusCode = 400;
          code = "DUPLICATE_ENTRY";
          errorMessage = "Duplicate entry";
          break;
        case "ER_ACCESS_DENIED_ERROR":
          statusCode = 500;
          errorMessage = "Database access denied";
          break;
        case "ER_NO_SUCH_TABLE":
          statusCode = 500;
          errorMessage = "Database table not found";
          break;
      }
    }
  } else if (typeof error === "string") {
    errorMessage = error;
    errorDetails = error;
  } else {
    errorDetails = JSON.stringify(error);
  }

  //* stack trace 只進 server log，不回給 client
  console.error(`${req.method} ${req.originalUrl} error:`, errorDetails);
  console.log(`--------`);

  //* 5xx 不回內部訊息（SQL / 連線等），只回固定文字
  if (statusCode >= 500) errorMessage = "Internal server error";
  return res.status(statusCode).json({ code, errorMessage });
}
