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
  /** 演示組織（#140）：管理員可跳過 10 分鐘待公開期 */
  isDemo: boolean;
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
  /** 待公開期（#140）：到 dueAt 才正式升到 Public；沒有待公開為 null */
  pendingPublic: { dueAt: string } | null;
}

/** 去向（E9-3）：完成的 Weave 交給了哪個單位或個人（receiverUnit 為 null 是個人領取） */
export interface OrgItemOutcome {
  weaveId: number;
  completedAt: string;
  quantity: number;
  receiver: { name: string };
  receiverUnit: OrgUnitRef | null;
}

/** 後台清單（閒置清單）的一列 */
export interface ManagedOrgItem extends OrgItem {
  outcomes: OrgItemOutcome[];
}

/**
 * 物品流轉時間軸的一步（E9-1，server: orgTimelineService）。
 * kind 之外的欄位依 kind 而不同；不認得的 kind（之後新增的紀錄）仍以通用格式顯示，所以這裡不列舉
 */
export interface OrgTimelineEntry {
  kind: string;
  at: string;
  actor: { type: "user"; name: string } | { type: "system" } | null;
  [detail: string]: unknown;
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

//* 組織報表（#143，E6-1、E6-2）：server/src/services/orgReport.ts 的 OrgReport
//* server：`GET /api/org-admin/orgs/:orgId/report`（只有 Org Admin）
export interface OrgReportTierStat {
  tier: AudienceTier;
  reachedItemCount: number;
  weaveCount: number;
  quantity: number;
  rate: number | null;
}

export interface OrgReportUnitStat {
  unit: OrgUnitRef;
  listedItemCount: number;
  listedQuantity: number;
  givenQuantity: number;
  receivedQuantity: number;
  givenEstimatedKgCO2e: number;
}

export interface OrgReportFactor {
  categoryId: string;
  name: string;
  kgCO2ePerKg: number | null;
  method: "reference_products" | "fixed_bom" | "product_factor" | "not_counted";
  basis: "material_bom" | "reference_epd" | null;
  sources: { title: string; publisher: string; year: number; url: string }[];
}

export interface OrgReport {
  listing: { itemCount: number; quantity: number };
  circulation: { weaveCount: number; quantity: number; rate: number | null };
  tiers: OrgReportTierStat[];
  units: OrgReportUnitStat[];
  value: {
    estimatedValueTwd: number;
    valuedQuantity: number;
    unvaluedQuantity: number;
  };
  emissions: {
    factorTableVersion: string;
    totalWeightKg: number;
    defaultWeightKg: number;
    defaultWeightShare: number | null;
    potentialKgCO2e: number;
    estimatedKgCO2e: number;
    replacementRate: {
      value: number;
      status: "assumed" | "surveyed";
      locator: string;
      source: { title: string; url: string };
    };
    countedQuantity: number;
    uncountedQuantity: number;
    byCategory: {
      categoryId: string;
      name: string;
      quantity: number;
      weightKg: number;
      potentialKgCO2e: number;
      estimatedKgCO2e: number;
    }[];
  };
  factors: OrgReportFactor[];
}
