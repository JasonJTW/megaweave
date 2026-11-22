"use client";

import { SWRConfig } from "swr";
import { apiFetcher } from "@/lib/api";

//* 全站 SWR 的 fetcher：key 是 `/api/...` 路徑，錯誤一律是 ApiError（lib/api）
export function ApiSWRConfig({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ fetcher: apiFetcher }}>{children}</SWRConfig>;
}
