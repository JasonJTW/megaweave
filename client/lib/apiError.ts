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

//* 有 code：翻譯（未知 code 顯示通用訊息）
//* 沒有 code（網路錯誤、非 JSON 回應、res.ok 但 success: false…）：用 fallback，沒給就顯示通用訊息
export function translateApiError(
  t: ErrorsTranslator,
  error: unknown,
  fallback?: string,
): string {
  const body = error instanceof ApiError ? error.body : error;
  const { code, params } = (body ?? {}) as { code?: unknown; params?: unknown };
  if (typeof code !== "string") return fallback ?? t("UNKNOWN");
  if (!t.has(code as ErrorKey)) return t("UNKNOWN");
  return t(code as ErrorKey, params as Record<string, string | number>);
}
