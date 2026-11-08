//* 組織頁、上架表單與物品管理共用（#136，PRD 0001 §5.1）
//* server：server/src/orgItems.ts（`/api/orgs`）
"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ApiError } from "@/lib/apiError";

export const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export const AUDIENCE_TIERS = ["internal", "members", "public"] as const;
export type AudienceTier = (typeof AUDIENCE_TIERS)[number];

export const ORG_ITEM_STATUSES = ["active", "inactive"] as const;
export type OrgItemStatus = (typeof ORG_ITEM_STATUSES)[number];

//* 後台依申請狀態篩選（#137）：有這個狀態的 Weave 的物品
export const ORG_ITEM_WEAVE_STATUSES = [
  "requested",
  "approved",
  "completed",
] as const;
export type OrgItemWeaveStatus = (typeof ORG_ITEM_WEAVE_STATUSES)[number];

export interface OrgUnitRef {
  id: number;
  name: string;
}

export interface OrgAccess {
  id: string;
  name: string;
  accessLevel: "internal" | "member";
  isAdmin: boolean;
  manageableUnits: OrgUnitRef[];
  /** 組織的 Auto Release 設定（#139）；單件可覆寫 */
  autoRelease: { enabled: boolean; days: number };
}

export type AutoReleaseOverride = "auto" | "manual";

export interface OrgItemCategory {
  id: string;
  name: string;
  examples: string;
  defaultWeightKg: number | null;
  defaultWeightSource: {
    title: string;
    publisher: string;
    year: number;
    url: string;
    locator: string;
  } | null;
}

export interface OrgPagePost {
  id: string;
  title: string;
  audienceTier: AudienceTier;
  createdAt: string;
  unit: OrgUnitRef;
  orgCategory: string | null;
  quantity: number | null;
  s3Keys: string[];
}

export interface OrgItem extends OrgPagePost {
  type: string;
  status: OrgItemStatus;
  unitWeightKg: number | null;
  weightIsDefault: boolean | null;
  assetNumber: string | null;
  estimatedValueTwd: number | null;
  pendingRequestCount: number;
  /** 單件覆寫；override 為 null 表示跟組織設定，days 只在 auto 時有值 */
  autoRelease: { override: AutoReleaseOverride | null; days: number | null };
}

/** 後台：一件物品的申請。receiver 是經手人，receiverUnit 是流向單位（個人申請為 null） */
export interface OrgItemRequest {
  id: number;
  status: OrgItemWeaveStatus;
  createdAt: string;
  quantity: number;
  receiver: { name: string };
  receiverUnit: OrgUnitRef | null;
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body, res.status);
  return body as T;
}

/** 呼叫者所屬的組織與目前選的那一個（`?org=<public id>`，沒帶就是第一個） */
export function useSelectedOrg() {
  const searchParams = useSearchParams();
  const { data, error, isLoading } = useSWR(`${hostName}/api/orgs`, (url) =>
    requestJson<{ orgs: OrgAccess[] }>(url),
  );
  const wanted = searchParams.get("org");
  const orgs = data?.orgs ?? [];
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { orgs, org, error, isLoading };
}

export function useOrgItemCategories() {
  const { data } = useSWR(`${hostName}/api/orgs/item-categories`, (url) =>
    requestJson<{ categories: OrgItemCategory[]; factorTableVersion: string }>(
      url,
    ),
  );
  return data?.categories ?? [];
}
