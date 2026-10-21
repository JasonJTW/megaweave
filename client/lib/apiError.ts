import type { useTranslations } from "next-intl";
import type zhTW from "@/messages/zh-TW.json";

//* server 錯誤回應 `{ code, errorMessage, params? }`（code 清單見 server/src/utils/errorCodes.ts）
//* 使用者看到的文字一律依 `code` 查 Errors namespace；`errorMessage` 是給 log 的英文，不直接顯示
export type ErrorsTranslator = ReturnType<typeof useTranslations<"Errors">>;
type ErrorKey = keyof (typeof zhTW)["Errors"];

//* 沒有 translator 可用的地方（services）丟這個，由 UI 層用 translateApiError 翻譯
export class ApiError extends Error {
  constructor(
    readonly body: unknown,
    readonly status?: number,
  ) {
    const { errorMessage } = (body ?? {}) as { errorMessage?: unknown };
    super(
      typeof errorMessage === "string" ? errorMessage : "API request failed",
    );
    this.name = "ApiError";
  }
}

export function translateApiError(t: ErrorsTranslator, body: unknown): string {
  if (body instanceof ApiError) body = body.body;
  const { code, params } = (body ?? {}) as { code?: unknown; params?: unknown };
  if (typeof code === "string" && t.has(code as ErrorKey)) {
    return t(code as ErrorKey, params as Record<string, string | number>);
  }
  return t("UNKNOWN");
}
