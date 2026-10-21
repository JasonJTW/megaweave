import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { translateApiError } from "@/lib/apiError";

//* 把 API 錯誤回應（或 services 丟出的 ApiError）轉成目前語言的訊息
//* `fallback`：錯誤沒有 code 時（網路錯誤等）顯示的頁面專屬文字
export function useApiErrorMessage() {
  const t = useTranslations("Errors");
  return useCallback(
    (error: unknown, fallback?: string) =>
      translateApiError(t, error, fallback),
    [t],
  );
}
