"use client";

import { useRouter } from "@/i18n/navigation";
import { splitLocalePrefix } from "@/i18n/routing";
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import SandboxNotice from "@/app/components/Lalamove/SandboxNotice";
import {
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ArrowRight,
  Undo2,
} from "lucide-react";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";
import { ApiError } from "@/lib/apiError";

/** 由後端依付款 + 外送單狀態推導（server/src/payments.ts derivePaymentOutcome） */
type PaymentOutcome =
  | "AWAITING_PAYMENT"
  | "PAYMENT_FAILED"
  | "PLACING"
  | "DISPATCHED"
  | "REFUNDING"
  | "REFUNDED";

interface PaymentStatusResponse {
  success: boolean;
  isPaid: boolean;
  outcome: PaymentOutcome;
  amount?: number;
  lalamoveOrderId?: string | null;
  rtnMsg?: string;
  error?: string;
}

// 前 12 次每 1.5 秒輪詢（一般付款 / 叫車幾秒內完成），之後每 5 秒；
// 上限涵蓋後端「付款後 60 秒檢查 + 叫車結果不明時最多等待 5 分鐘」
const FAST_POLLS = 12;
const FAST_POLL_MS = 1500;
const SLOW_POLL_MS = 5000;
const MAX_POLL_DURATION_MS = 8 * 60 * 1000;

const PENDING_OUTCOMES: PaymentOutcome[] = ["AWAITING_PAYMENT", "PLACING"];

function PaymentResultContent() {
  const router = useRouter();
  const t = useTranslations("PaymentResult");
  const apiErrorMessage = useApiErrorMessage();
  const searchParams = useSearchParams();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

  // 優先從 URL 讀取，若為 ClientBackURL 則從 sessionStorage 讀取
  const [merchantTradeNo, setMerchantTradeNo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [pollingExhausted, setPollingExhausted] = useState(false);
  const pollCountRef = useRef(0);
  const pollStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("MerchantTradeNo");
    const fromStorage =
      typeof window !== "undefined"
        ? sessionStorage.getItem("lastMerchantTradeNo")
        : null;
    const finalNo = fromUrl || fromStorage || "";
    setMerchantTradeNo(finalNo);
  }, [searchParams]);

  // 向後端查詢真實付款與 Lalamove 派單狀態
  const checkStatus = useCallback(async () => {
    if (!merchantTradeNo) {
      setLoading(false);
      return;
    }
    pollStartedAtRef.current ??= Date.now();

    try {
      const res = await fetch(
        `${hostName}/api/payments/status/${encodeURIComponent(merchantTradeNo)}`,
        {
          credentials: "include",
        },
      );

      const data: PaymentStatusResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new ApiError(data);
      }

      setStatusData(data);
      setLoading(false);

      // 已建立 Lalamove 訂單 → 自動跳轉至外送即時追蹤頁
      if (data.outcome === "DISPATCHED" && data.lalamoveOrderId) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("lastMerchantTradeNo");
        }
        // 延遲 1.5 秒讓使用者看到成功畫面，隨後自動跳轉外送追蹤頁
        setTimeout(() => {
          router.push(`/delivery/${data.lalamoveOrderId}`);
        }, 1500);
        return;
      }

      // 尚未付款完成或叫車中 → 繼續輪詢，直到結果確定或超過上限
      if (PENDING_OUTCOMES.includes(data.outcome)) {
        const elapsed = Date.now() - (pollStartedAtRef.current ?? Date.now());
        if (elapsed >= MAX_POLL_DURATION_MS) {
          setPollingExhausted(true);
          return;
        }
        pollCountRef.current += 1;
        setTimeout(
          checkStatus,
          pollCountRef.current < FAST_POLLS ? FAST_POLL_MS : SLOW_POLL_MS,
        );
      }
    } catch (err: unknown) {
      console.error("Check payment status error:", err);
      const msg = apiErrorMessage(err, t("checkFailed"));
      setErrorMessage(msg);
      setLoading(false);
    }
  }, [merchantTradeNo, hostName, router, t, apiErrorMessage]);

  useEffect(() => {
    if (merchantTradeNo) {
      checkStatus();
    }
  }, [merchantTradeNo, checkStatus]);

  const outcome = statusData?.outcome;
  const amount = statusData?.amount ?? 0;

  const tradeNoBadge = merchantTradeNo && (
    <p className="rounded-lg bg-gray-100 px-4 py-1.5 font-mono text-xs text-gray-600">
      {t("tradeNo", { tradeNo: merchantTradeNo })}
    </p>
  );

  // 渲染載入或處理中狀態（付款確認中 / 叫車中）
  if (
    loading ||
    (!errorMessage &&
      outcome &&
      PENDING_OUTCOMES.includes(outcome) &&
      !pollingExhausted)
  ) {
    const isPlacing = outcome === "PLACING";
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <RotateCw className="h-8 w-8 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isPlacing ? t("placingTitle") : t("checkingTitle")}
          </h2>
          <p className="text-xs text-gray-500">
            {isPlacing ? t("placingBody") : t("checkingBody")}
          </p>
          {tradeNoBadge}
        </div>
      </div>
    );
  }

  const handleReturn = () => {
    const lastPostUrl =
      typeof window !== "undefined"
        ? sessionStorage.getItem("lastPostUrl")
        : null;
    if (lastPostUrl) {
      // Stored from window.location, so it may already carry a locale prefix
      const { locale, pathname } = splitLocalePrefix(lastPostUrl);
      router.push(pathname, { locale });
    } else {
      router.push("/");
    }
  };

  const retryButtons = (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleReturn}
        className="w-full rounded-xl border border-orange-400 bg-white py-3 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50"
      >
        {t("retry")}
      </button>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-200"
      >
        {t("home")}
      </button>
    </div>
  );

  let content: React.ReactNode;

  if (!errorMessage && outcome === "DISPATCHED") {
    content = (
      <>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("paidTitle")}</h1>
          <p className="text-sm text-gray-500">{t("paidMatched")}</p>
          {tradeNoBadge}
        </div>
        <button
          type="button"
          onClick={() =>
            router.push(`/delivery/${statusData?.lalamoveOrderId}`)
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600"
        >
          {t("goTracking")}
          <ArrowRight className="h-4 w-4" />
        </button>
      </>
    );
  } else if (!errorMessage && outcome === "PLACING") {
    // 輪詢已達上限仍在叫車中（叫車結果不明的等待期）
    content = (
      <>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <RotateCw className="h-10 w-10 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("stillConfirmingTitle")}
          </h1>
          <p className="text-sm text-gray-500">{t("stillConfirmingBody")}</p>
          {tradeNoBadge}
        </div>
        <button
          type="button"
          onClick={() => router.push("/history")}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600"
        >
          {t("viewOrders")}
        </button>
      </>
    );
  } else if (
    !errorMessage &&
    (outcome === "REFUNDING" || outcome === "REFUNDED")
  ) {
    const refunded = outcome === "REFUNDED";
    content = (
      <>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <Undo2 className="h-10 w-10 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {refunded ? t("refundedTitle") : t("dispatchFailedTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {refunded
              ? t("refundedBody", { amount })
              : t("dispatchFailedBody", { amount })}
          </p>
          {tradeNoBadge}
        </div>
        {retryButtons}
      </>
    );
  } else {
    // 付款失敗 / 未完成 / 查詢錯誤 / 付款結果長時間未回傳
    const awaitingTooLong = !errorMessage && outcome === "AWAITING_PAYMENT";
    content = (
      <>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {awaitingTooLong ? t("stillConfirmingTitle") : t("unpaidTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {awaitingTooLong
              ? t("awaitingPaymentBody")
              : errorMessage || t("unpaidBody")}
          </p>
          {tradeNoBadge}
        </div>
        {retryButtons}
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        {content}
        <SandboxNotice className="mt-6" />
      </div>
    </div>
  );
}

/**
 * /delivery/payment-result
 *
 * 綠界付款跳轉後的結果驗證頁面。
 * 🔒 安全設計：不依賴前端傳入的 query params 判斷付款結果，
 * 一律向後端資料庫查詢經由 CheckMacValue 簽名驗證後的真實驗證狀態，
 * 並取得 Lalamove 即時派單訂單號後，自動精準跳轉到 /delivery/[orderId] 即時追蹤頁。
 */
export default function PaymentResultPage() {
  const t = useTranslations("PaymentResult");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <RotateCw className="h-8 w-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t("loading")}</h2>
          </div>
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}
