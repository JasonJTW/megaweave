"use client";

//* 申請組織物品時可代表的單位（#137，ADR 0004）：server/src/weaves.ts `GET /api/weaves/acting-units`
//* 空陣列代表只有一種身分，不顯示「代表誰」；個人貼文不發請求
import useSWR from "swr";
import { requestJson } from "@/lib/orgApi";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

export interface ActingUnit {
  id: number;
  name: string;
}

export function useActingUnits(post: { id: number; org_id?: number | null }): {
  units: ActingUnit[];
  isLoading: boolean;
} {
  const key =
    post.org_id != null
      ? `${hostName}/api/weaves/acting-units?postId=${post.id}`
      : null;
  const { data, isLoading } = useSWR(key, (url: string) =>
    requestJson<{ units: ActingUnit[] }>(url),
  );
  return { units: data?.units ?? [], isLoading: key !== null && isLoading };
}
