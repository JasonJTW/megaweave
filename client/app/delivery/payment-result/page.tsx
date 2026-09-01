"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, RotateCw, ArrowRight } from "lucide-react";

interface PaymentStatusResponse {
  success: boolean;
  isPaid: boolean;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  deliveryStatus?: "PENDING_PAYMENT" | "ORDER_PLACING" | "ASSIGNING_DRIVER" | "ON_GOING" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  lalamoveOrderId?: string | null;
  rtnMsg?: string;
  error?: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

  // 優先從 URL 讀取，若為 ClientBackURL 則從 sessionStorage 讀取
  const [merchantTradeNo, setMerchantTradeNo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const pollCountRef = useRef(0);

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

    try {
      const res = await fetch(
        `${hostName}/api/payments/status/${encodeURIComponent(merchantTradeNo)}`,
        {
          credentials: "include",
        },
      );

      const data: PaymentStatusResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "無法取得訂單狀態");
      }

      setStatusData(data);

      // 若已付款且 Lalamove 訂單已建立，自動跳轉至外送即時追蹤頁
      if (data.isPaid && data.lalamoveOrderId) {
        setLoading(false);
        // 清理暫存
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("lastMerchantTradeNo");
        }
        // 延遲 1.5 秒讓使用者看到成功畫面，隨後自動跳轉外送追蹤頁
        setTimeout(() => {
          router.push(`/delivery/${data.lalamoveOrderId}`);
        }, 1500);
        return;
      }

      // 若狀態仍為 PENDING 或正在派單中，且輪詢未達上限，則繼續輪詢
      if (
        (data.paymentStatus === "PENDING" ||
          data.deliveryStatus === "ORDER_PLACING") &&
        pollCountRef.current < 12
      ) {
        pollCountRef.current += 1;
        setTimeout(checkStatus, 1500);
      } else {
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error("Check payment status error:", err);
      const msg = err instanceof Error ? err.message : "查詢失敗";
      setErrorMessage(msg);
      setLoading(false);
    }
  }, [merchantTradeNo, hostName, router]);

  useEffect(() => {
    if (merchantTradeNo) {
      checkStatus();
    }
  }, [merchantTradeNo, checkStatus]);

  // 渲染載入或處理中狀態
  if (loading || (statusData?.isPaid && !statusData?.lalamoveOrderId && pollCountRef.current < 12)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <RotateCw className="h-8 w-8 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">正在確認付款與媒合司機...</h2>
          <p className="text-xs text-gray-500">
            請稍候，後端正與綠界及 Lalamove 即時同步您的訂單狀態
          </p>
          {merchantTradeNo && (
            <p className="rounded-lg bg-gray-100 px-3 py-1 font-mono text-[11px] text-gray-600">
              交易序號：{merchantTradeNo}
            </p>
          )}
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
      router.push(lastPostUrl);
    } else {
      router.push("/");
    }
  };

  const isPaid = statusData?.isPaid ?? false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        {isPaid ? (
          <>
            {/* 付款成功 */}
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">付款成功！</h1>
              <p className="text-sm text-gray-500">
                {statusData?.lalamoveOrderId
                  ? "已成功為您媒合 Lalamove 司機，正在跳轉至即時追蹤頁..."
                  : "我們已收到您的款項，外送訂單正在安排中。"}
              </p>
              {merchantTradeNo && (
                <p className="rounded-lg bg-gray-100 px-4 py-1.5 font-mono text-xs text-gray-600">
                  交易序號：{merchantTradeNo}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {statusData?.lalamoveOrderId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/delivery/${statusData.lalamoveOrderId}`)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600"
                >
                  前往外送即時追蹤
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/history")}
                  className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow-md shadow-green-600/25 transition-all hover:bg-green-700"
                >
                  查看我的訂單列表
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 付款失敗或未完成 */}
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-10 w-10 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">付款未完成</h1>
              <p className="text-sm text-gray-500">
                {statusData?.rtnMsg || errorMessage || "付款尚未完成或已被取消，您尚未被扣款。"}
              </p>
              {merchantTradeNo && (
                <p className="rounded-lg bg-gray-100 px-4 py-1.5 font-mono text-xs text-gray-600">
                  交易序號：{merchantTradeNo}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleReturn}
                className="w-full rounded-xl border border-orange-400 bg-white py-3 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50"
              >
                返回重新下單
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-200"
              >
                回首頁
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
