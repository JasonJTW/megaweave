import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { translateApiError } from "@/lib/apiError";

//* 把 API 錯誤回應（或 services 丟出的 ApiError）轉成目前語言的訊息
export function useApiErrorMessage() {
  const t = useTranslations("Errors");
  return useCallback((body: unknown) => translateApiError(t, body), [t]);
}
