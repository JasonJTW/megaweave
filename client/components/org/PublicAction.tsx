"use client";

//* 升到 Public（#140，PRD 0001 §5.1 E2-6、E2-7、E4-2；ADR 0003）：只給 Org Admin
//* - 公開前先確認：列出名稱與財產編號；有財產編號要勾「已完成報廢／處分程序」才能送出
//* - 送出後 10 分鐘待公開：顯示倒數，可一鍵取消；演示組織另有「跳過」鍵立即公開
//* - 已公開：可降回組織成員（降級會從公開 Feed、搜尋、排行移除，非成員的待核可申請自動婉拒）
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { Button } from "@/components/ui/button";
import { hostName, OrgAccess, OrgItem, requestJson } from "@/lib/orgApi";
import { compactButton } from "@/components/org/OrgShell";
import { isOrgListingKey } from "@/lib/orgSwrKeys";

function useRemaining(dueAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dueAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [dueAt]);
  return dueAt ? Math.max(0, Date.parse(dueAt) - now) : null;
}

function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PublicAction({ org, item }: { org: OrgAccess; item: OrgItem }) {
  const t = useTranslations("Org.manage");
  const apiErrorMessage = useApiErrorMessage();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disposalConfirmed, setDisposalConfirmed] = useState(false);
  const remaining = useRemaining(item.pendingPublic?.dueAt ?? null);
  const base = `${hostName}/api/orgs/${org.id}/items/${item.id}`;

  //* 倒數結束後，排程最多晚一分鐘公開：每 15 秒重抓一次清單直到層級變了
  const due = remaining === 0;
  useEffect(() => {
    if (!due) return;
    const timer = window.setInterval(
      () => mutate(isOrgListingKey(hostName, org.id)),
      15_000,
    );
    return () => window.clearInterval(timer);
  }, [due, mutate, org.id]);

  if (!org.isAdmin) return null;

  async function run(
    url: string,
    init: RequestInit,
    success: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await requestJson(url, init);
      await mutate(isOrgListingKey(hostName, org.id));
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, t("tierChangeFailed")));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (item.pendingPublic) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="org-pending-public"
      >
        <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-amber-50 px-2.5 text-xs font-medium tabular-nums text-amber-900 ring-1 ring-inset ring-amber-200">
          {remaining && remaining > 0
            ? t("pendingPublic", { time: formatRemaining(remaining) })
            : t("pendingPublicDue")}
        </span>
        <Button
          size="sm"
          className={compactButton}
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              `${base}/pending-public`,
              { method: "DELETE" },
              t("pendingPublicCancelled"),
            )
          }
        >
          {t("cancelPendingPublic")}
        </Button>
        {org.isDemo && (
          <Button
            size="sm"
            className={compactButton}
            disabled={busy}
            onClick={() =>
              run(
                `${base}/pending-public/skip`,
                { method: "POST" },
                t("publishedNow"),
              )
            }
          >
            {t("skipPendingPublic")}
          </Button>
        )}
      </div>
    );
  }

  if (item.audienceTier === "public") {
    return (
      <Button
        size="sm"
        className={compactButton}
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (
            !window.confirm(t("demoteFromPublicConfirm", { title: item.title }))
          )
            return;
          run(
            `${base}/tier`,
            { method: "PATCH", body: JSON.stringify({ tier: "members" }) },
            t("demotedFromPublic"),
          );
        }}
      >
        {t("demoteFromPublic")}
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        className={compactButton}
        variant="outline"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("makePublic")}
      </Button>
    );
  }

  const needsDisposal = item.assetNumber !== null;
  return (
    <div
      role="group"
      aria-label={t("publicConfirmTitle", { title: item.title })}
      className="w-72 space-y-2 whitespace-normal rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm"
    >
      <p className="font-semibold">
        {t("publicConfirmTitle", { title: item.title })}
      </p>
      {item.assetNumber && (
        <p>{t("publicConfirmAsset", { asset: item.assetNumber })}</p>
      )}
      <p className="text-amber-900/80">{t("publicConfirmBody")}</p>
      {needsDisposal && (
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={disposalConfirmed}
            onChange={(e) => setDisposalConfirmed(e.target.checked)}
          />
          {t("publicConfirmDisposal")}
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className={compactButton}
          disabled={busy || (needsDisposal && !disposalConfirmed)}
          onClick={async () => {
            const ok = await run(
              `${base}/pending-public`,
              {
                method: "POST",
                body: JSON.stringify({
                  assetDisposalConfirmed: needsDisposal && disposalConfirmed,
                }),
              },
              t("pendingPublicStarted"),
            );
            if (ok) setConfirming(false);
          }}
        >
          {t("publicConfirmSubmit")}
        </Button>
        <Button
          size="sm"
          className={compactButton}
          variant="ghost"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          {t("publicConfirmCancel")}
        </Button>
      </div>
    </div>
  );
}
