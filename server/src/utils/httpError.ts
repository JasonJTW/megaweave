import { ErrorCode } from "./errorCodes";

//* 可預期的錯誤（4xx）：路由裡 `return next(new HttpError(...))`，由 errorMiddleware 統一回應
//* `message` 是英文，只供 log 與除錯；使用者看到的文字由 client 依 `code` 翻譯
//* `params` 會原樣回給 client，當作翻譯字串的 ICU 參數
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
