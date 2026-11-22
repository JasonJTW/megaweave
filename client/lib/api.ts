import { ApiError } from "./apiError";

//* 瀏覽器呼叫自家 API 的唯一入口（含 SWR 的全域 fetcher）
//* - path 一律以 `/api/` 開頭，base URL 由這裡補上；SWR key 也用同一個 path
//* - 一律帶 cookie、不走 HTTP 快取
//* - body 是物件就送 JSON，是 FormData 就原樣送出
//* - 非 2xx 一律丟 ApiError（帶 server 的 `{ code, errorMessage, params }`），UI 用 translateApiError 翻譯
//* - 204 或非 JSON 的成功回應回傳 undefined / null
//* server 端（metadata、route handler、server component）與 S3 上傳不走這裡

export type ApiPath = `/api/${string}`;

export interface ApiOptions extends Omit<RequestInit, "body" | "credentials"> {
  body?: unknown;
}

const baseUrl = process.env.NEXT_PUBLIC_HOSTNAME ?? "";

export function apiUrl(path: ApiPath): string {
  return `${baseUrl}${path}`;
}

export async function api<T = unknown>(
  path: ApiPath,
  { body, headers, ...init }: ApiOptions = {},
): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(apiUrl(path), {
    cache: "no-store",
    ...init,
    credentials: "include",
    headers:
      body === undefined || isForm
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : isForm
          ? (body as FormData)
          : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data, res.status);
  return data as T;
}

//* SWRConfig 的全域 fetcher：key 就是 ApiPath
export function apiFetcher<T = unknown>(path: ApiPath): Promise<T> {
  return api<T>(path);
}
