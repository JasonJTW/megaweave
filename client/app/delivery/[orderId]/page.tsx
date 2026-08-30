"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Truck,
  Phone,
  MessageSquare,
  ArrowLeft,
  Share2,
  ExternalLink,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Ban,
  User,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSocketContext } from "@/app/contexts/SocketContext";
import * as Dialog from "@radix-ui/react-dialog";
import SandboxPanel from "@/app/components/Lalamove/SandboxPanel";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

interface DriverInfo {
  id: string;
  name: string;
  phone: string;
  plateNumber: string;
  photo?: string;
  coordinates?: {
    lat: string | number;
    lng: string | number;
  };
  updatedAt?: string | Date;
}

interface OrderDetail {
  orderId: string;
  quotationId: string;
  serviceType?: string;
  status:
    | "ASSIGNING_DRIVER"
    | "ON_GOING"
    | "PICKED_UP"
    | "COMPLETED"
    | "CANCELED"
    | "CANCELLED"
    | "EXPIRED"
    | "REJECTED"
    | string;
  shareLink?: string;
  driverId?: string;
  driver?: DriverInfo | null;
  priceBreakdown: {
    total: string;
    currency: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  distance?: {
    value: string;
    unit: string;
  };
  stops: Array<{
    id?: string;
    coordinates: {
      lat: string | number;
      lng: string | number;
    };
    address: string;
    name?: string;
    phone?: string;
    remarks?: string;
  }>;
  metadata?: Record<string, unknown>;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "無法載入訂單資料");
  }
  const data = await res.json();
  return data.order as OrderDetail;
};

// 車型名稱字典
const VEHICLE_NAMES: Record<string, { name: string; icon: string }> = {
  MOTORCYCLE: { name: "機車", icon: "🛵" },
  MOTORCYCLE_LARGELALABAG: { name: "機車大保溫袋", icon: "🛵" },
  MOTORCYCLE_INTERCITY: { name: "跨區機車", icon: "🏍️" },
  SUV: { name: "廂型貨車（半車）", icon: "🚙" },
  VAN: { name: "廂型貨車（全車）", icon: "🚐" },
  TRUCK175: { name: "1.75噸 貨車", icon: "🚚" },
  TRUCK330: { name: "3.49噸 貨車", icon: "🚛" },
  TRUCK500: { name: "5噸 貨車", icon: "🚛" },
};

// 狀態翻譯與顏色對應
const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    desc: string;
    badgeBg: string;
    badgeText: string;
    stepIndex: number;
  }
> = {
  ASSIGNING_DRIVER: {
    label: "正在媒合司機",
    desc: "已向附近司機發送訂單，預計 1~3 分鐘內接單",
    badgeBg: "bg-amber-500/10 border-amber-500/30 text-amber-600",
    badgeText: "媒合中",
    stepIndex: 1,
  },
  ASSIGNED: {
    label: "司機已接單，前往取件中",
    desc: "司機正在前往寄件地點，請準備好物品",
    badgeBg: "bg-blue-500/10 border-blue-500/30 text-blue-600",
    badgeText: "前往取件",
    stepIndex: 2,
  },
  ON_GOING: {
    label: "司機已接單，前往取件中",
    desc: "司機正在前往寄件地點，請準備好物品",
    badgeBg: "bg-blue-500/10 border-blue-500/30 text-blue-600",
    badgeText: "前往取件",
    stepIndex: 2,
  },
  PICKED_UP: {
    label: "司機已取件，配送運送中",
    desc: "物品已在路途中，司機正前往送達地點",
    badgeBg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
    badgeText: "運送中",
    stepIndex: 3,
  },
  IN_DELIVERY: {
    label: "司機已取件，配送運送中",
    desc: "物品已在路途中，司機正前往送達地點",
    badgeBg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
    badgeText: "運送中",
    stepIndex: 3,
  },
  COMPLETED: {
    label: "配送已順利完成",
    desc: "感謝使用 Lalamove 即時快遞服務！",
    badgeBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
    badgeText: "已送達",
    stepIndex: 4,
  },
  FULFILLED: {
    label: "配送已順利完成",
    desc: "感謝使用 Lalamove 即時快遞服務！",
    badgeBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
    badgeText: "已送達",
    stepIndex: 4,
  },
  DELIVERED: {
    label: "配送已順利完成",
    desc: "感謝使用 Lalamove 即時快遞服務！",
    badgeBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
    badgeText: "已送達",
    stepIndex: 4,
  },
  FINISHED: {
    label: "配送已順利完成",
    desc: "感謝使用 Lalamove 即時快遞服務！",
    badgeBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
    badgeText: "已送達",
    stepIndex: 4,
  },
  CANCELED: {
    label: "訂單已取消",
    desc: "此筆配送訂單已被取消",
    badgeBg: "bg-rose-500/10 border-rose-500/30 text-rose-600",
    badgeText: "已取消",
    stepIndex: -1,
  },
  CANCELLED: {
    label: "訂單已取消",
    desc: "此筆配送訂單已被取消",
    badgeBg: "bg-rose-500/10 border-rose-500/30 text-rose-600",
    badgeText: "已取消",
    stepIndex: -1,
  },
  EXPIRED: {
    label: "訂單已超時失效",
    desc: "無司機接單，訂單已自動失效",
    badgeBg: "bg-gray-500/10 border-gray-500/30 text-gray-600",
    badgeText: "已失效",
    stepIndex: -1,
  },
  REJECTED: {
    label: "訂單已拒絕",
    desc: "訂單未能成功媒合",
    badgeBg: "bg-rose-500/10 border-rose-500/30 text-rose-600",
    badgeText: "未成功",
    stepIndex: -1,
  },
};

export default function DeliveryTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = (params?.orderId as string) || "";
  const { socket } = useSocketContext();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [fetchErrorCount, setFetchErrorCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  // 頁面掛載後偵測 Google Maps 是否已就緒
  useEffect(() => {
    if (typeof window.google?.maps?.Map === "function") {
      setMapReady(true);
    }
  }, []);

  // 地圖相關 Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const driverPolylineRef = useRef<google.maps.Polyline | null>(null);

  // SWR 定時輪詢（未完成前每 3 秒輪詢一次）
  const {
    data: order,
    error,
    isLoading,
    mutate,
  } = useSWR<OrderDetail>(
    orderId ? `${hostName}/api/lalamove/orders/${orderId}` : null,
    fetcher,
    {
      refreshInterval: (latestData) => {
        if (!latestData) return 3000;
        const s = (latestData.status || "").trim().toUpperCase();
        if (
          s === "COMPLETED" ||
          s === "FULFILLED" ||
          s === "DELIVERED" ||
          s === "FINISHED" ||
          s === "CANCELED" ||
          s === "CANCELLED" ||
          s === "EXPIRED" ||
          s === "REJECTED"
        ) {
          return 0; // 結束後停止輪詢
        }
        return 3000;
      },
      revalidateOnFocus: true,
      dedupingInterval: 1000,
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        // 最多重試 10 次 (約 30 秒)，讓 Lalamove 有時間處理剛建立的訂單
        if (retryCount >= 10) return;
        setFetchErrorCount(retryCount + 1);
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
    },
  );

  // 監聽 Socket.IO 即時更新事件
  useEffect(() => {
    if (!socket || !orderId) return;

    socket.emit("join_delivery", orderId);

    const handleDeliveryUpdate = (updateData: unknown) => {
      console.log("⚡ [Socket] Received delivery_update:", updateData);
      mutate();
    };

    socket.on("delivery_update", handleDeliveryUpdate);

    return () => {
      socket.emit("leave_delivery", orderId);
      socket.off("delivery_update", handleDeliveryUpdate);
    };
  }, [socket, orderId, mutate]);

  // Google Maps 初始化與 Marker / 路線繪製
  useEffect(() => {
    if (!mapContainerRef.current || !order || typeof window === "undefined")
      return;

    // 等待 Google Maps 完整載入（Map 建構子可用）才執行初始化
    const isGoogleMapsReady = () =>
      typeof window.google?.maps?.Map === "function";

    if (!isGoogleMapsReady()) {
      // 若 Maps API 尚未就緒，每 200ms 重新確認一次，最多等 10 秒
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (isGoogleMapsReady()) {
          clearInterval(poll);
          // 重新觸發此 effect（透過 state 更新）
          setMapReady(true);
        } else if (attempts >= 50) {
          clearInterval(poll); // 逾時放棄
        }
      }, 200);
      return () => clearInterval(poll);
    }

    const stops = order.stops || [];
    const origin = stops[0]?.coordinates;
    const dest = stops[stops.length - 1]?.coordinates;

    const defaultCenter = origin
      ? { lat: Number(origin.lat), lng: Number(origin.lng) }
      : { lat: 25.033, lng: 121.5654 };

    // 1. 建立地圖實例
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(
        mapContainerRef.current,
        {
          center: defaultCenter,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        },
      );
    }

    const map = mapInstanceRef.current;

    // 2. 繪製起點 Marker (寄件)
    if (origin && !originMarkerRef.current) {
      originMarkerRef.current = new window.google.maps.Marker({
        position: { lat: Number(origin.lat), lng: Number(origin.lng) },
        map,
        title: "取件點",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#10b981",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }

    // 3. 繪製終點 Marker (送件)
    if (dest && !destMarkerRef.current) {
      destMarkerRef.current = new window.google.maps.Marker({
        position: { lat: Number(dest.lat), lng: Number(dest.lng) },
        map,
        title: "送件點",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#ea580c",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }

    // 4. 繪製起訖點路徑 Polyline (橘色高質感連線)
    if (origin && dest) {
      const lineCoordinates = [
        { lat: Number(origin.lat), lng: Number(origin.lng) },
        { lat: Number(dest.lat), lng: Number(dest.lng) },
      ];

      if (!routePolylineRef.current) {
        routePolylineRef.current = new window.google.maps.Polyline({
          path: lineCoordinates,
          geodesic: true,
          strokeColor: "#ea580c",
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map,
        });
      } else {
        routePolylineRef.current.setPath(lineCoordinates);
      }
    }

    // 5. 司機即時 Marker
    const driverCoords = order.driver?.coordinates;
    if (driverCoords && driverCoords.lat && driverCoords.lng) {
      const driverPos = {
        lat: Number(driverCoords.lat),
        lng: Number(driverCoords.lng),
      };

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new window.google.maps.Marker({
          position: driverPos,
          map,
          title: `司機：${order.driver?.name || "Lalamove 司機"}`,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#f97316",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      } else {
        driverMarkerRef.current.setPosition(driverPos);
      }

      // 5b. 司機到下一站目標的虛線（媒合/取件中→取件點，運送中→送達點）
      const targetCoords =
        normalizedStatus === "PICKED_UP" || normalizedStatus === "IN_DELIVERY"
          ? dest
          : origin;
      if (targetCoords) {
        const driverLine = [
          driverPos,
          { lat: Number(targetCoords.lat), lng: Number(targetCoords.lng) },
        ];
        if (!driverPolylineRef.current) {
          driverPolylineRef.current = new window.google.maps.Polyline({
            path: driverLine,
            geodesic: true,
            strokeColor: "#f97316",
            strokeOpacity: 0,
            strokeWeight: 0,
            icons: [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: 0.7,
                  strokeColor: "#f97316",
                  scale: 3,
                },
                offset: "0",
                repeat: "16px",
              },
            ],
            map,
          });
        } else {
          driverPolylineRef.current.setPath(driverLine);
        }
      }
    }

    // 6. Fit Bounds 自動縮放視野（僅在司機位置合理時才納入計算）
    const bounds = new window.google.maps.LatLngBounds();
    if (origin)
      bounds.extend({ lat: Number(origin.lat), lng: Number(origin.lng) });
    if (dest) bounds.extend({ lat: Number(dest.lat), lng: Number(dest.lng) });

    // 只有當司機距離取/送點不超過 1.5 度（約 150km）時才納入 bounds
    if (driverCoords?.lat && driverCoords?.lng) {
      const dLat = Math.abs(
        Number(driverCoords.lat) - Number(origin?.lat || dest?.lat || 25),
      );
      const dLng = Math.abs(
        Number(driverCoords.lng) - Number(origin?.lng || dest?.lng || 121),
      );
      if (dLat < 1.5 && dLng < 1.5) {
        bounds.extend({
          lat: Number(driverCoords.lat),
          lng: Number(driverCoords.lng),
        });
      }
    }

    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    // 確保縮放不低於 11 級（避免世界地圖）
    const listener = window.google.maps.event.addListenerOnce(
      map,
      "bounds_changed",
      () => {
        if ((map.getZoom() ?? 15) < 11) map.setZoom(12);
      },
    );
    return () => window.google.maps.event.removeListener(listener);
  }, [order, mapReady]);

  // 取消訂單處理
  const handleCancelOrder = async () => {
    if (!orderId) return;
    try {
      setIsCancelling(true);
      const res = await fetch(`${hostName}/api/lalamove/orders/${orderId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "取消訂單失敗");
      }
      toast.success("已成功取消 Lalamove 配送訂單");
      setIsCancelModalOpen(false);
      mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "取消訂單失敗";
      toast.error(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  // 複製連結
  const copyTrackingLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success("已複製即時追蹤連結！");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-3xl bg-orange-50 text-orange-500 shadow-sm">
          <Truck className="h-8 w-8" />
        </div>
        <p className="mt-4 font-semibold text-gray-700">
          正在載入配送訂單資訊...
        </p>
      </div>
    );
  }

  // 若剛下單後短暫查無資料，改顯示載入畫面（最多重試 10 次）
  if ((error || !order) && fetchErrorCount < 10) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-3xl bg-orange-50 text-orange-500 shadow-sm">
          <Truck className="h-8 w-8" />
        </div>
        <p className="mt-4 font-semibold text-gray-700">
          正在連線至 Lalamove 訂單系統...
        </p>
        <p className="mt-1 text-xs text-gray-400">
          首次載入可能需要數秒，請稍候
          {fetchErrorCount > 0 ? `（第 ${fetchErrorCount} 次重試）` : ""}
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-gray-900">查無此配送訂單</h2>
        <p className="mt-2 text-xs text-gray-500">
          {error?.message || "請確認訂單編號是否正確或稍後再試。"}
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-600"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首頁
        </button>
      </div>
    );
  }

  const normalizedStatus = (order.status || "").trim().toUpperCase();
  const currentStatusConfig =
    STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.ASSIGNING_DRIVER;
  const isCancellable =
    normalizedStatus === "ASSIGNING_DRIVER" ||
    normalizedStatus === "ON_GOING" ||
    normalizedStatus === "ASSIGNED";
  const stops = order.stops || [];
  const originStop = stops[0];
  const destStop = stops[stops.length - 1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-white to-gray-50/60 pb-16 pt-4 sm:pt-8">
      <div className="mx-auto max-w-5xl px-3 sm:px-6">
        {/* Top Navigation Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-gray-500">
                  訂單編號
                </span>
                <span className="font-mono text-xs font-extrabold text-gray-900">
                  #{order.orderId}
                </span>
                {order.serviceType && (
                  <span className="flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
                    <span>
                      {VEHICLE_NAMES[order.serviceType]?.icon || "🚛"}
                    </span>
                    <span>
                      {VEHICLE_NAMES[order.serviceType]?.name ||
                        order.serviceType}
                    </span>
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-gray-900 sm:text-xl">
                Lalamove 即時配送追蹤
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Lalamove 官方 ShareLink */}
            {order.shareLink && (
              <a
                href={order.shareLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-2xl border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-bold text-orange-700 shadow-sm transition hover:bg-orange-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Lalamove 官方追蹤頁</span>
              </a>
            )}

            {/* 複製追蹤網址按鈕 */}
            <button
              type="button"
              onClick={copyTrackingLink}
              className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Share2 className="h-3.5 w-3.5 text-gray-500" />
              <span className="hidden sm:inline">分享追蹤連結</span>
            </button>

            {/* 手動重整 */}
            <button
              type="button"
              onClick={() => mutate()}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 active:scale-95"
              title="重新整理"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 狀態橫幅 Banner */}
        <div className="mb-4 overflow-hidden rounded-3xl border border-orange-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-500/25">
                <Truck className="h-6 w-6" />
                {order.status === "ASSIGNING_DRIVER" && (
                  <span className="absolute -right-1 -top-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${currentStatusConfig.badgeBg}`}
                  >
                    {currentStatusConfig.badgeText}
                  </span>
                  <span className="text-xs text-gray-400">即時同步</span>
                </div>
                <h2 className="mt-1 text-base font-extrabold text-gray-900 sm:text-lg">
                  {currentStatusConfig.label}
                </h2>
                <p className="text-xs text-gray-500">
                  {currentStatusConfig.desc}
                </p>
              </div>
            </div>

            {/* 取消訂單按鈕 (若符合條件) */}
            {isCancellable && (
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                className="self-start rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 sm:self-center"
              >
                取消配送訂單
              </button>
            )}
          </div>

          {/* 流程進度條 (Stepper) */}
          {currentStatusConfig.stepIndex > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <div className="relative grid grid-cols-4 gap-2 text-center text-xs">
                {/* 橫向進度線條 */}
                <div className="absolute left-[12.5%] right-[12.5%] top-3.5 -z-0 h-1 -translate-y-1/2 bg-gray-200">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{
                      width: `${((Math.min(currentStatusConfig.stepIndex, 4) - 1) / 3) * 100}%`,
                    }}
                  />
                </div>

                {[
                  { title: "已建立訂單", index: 1 },
                  { title: "媒合司機", index: 2 },
                  { title: "取件運送中", index: 3 },
                  { title: "順利送達", index: 4 },
                ].map((step) => {
                  const isDone = currentStatusConfig.stepIndex >= step.index;
                  const isCurrent =
                    currentStatusConfig.stepIndex === step.index;
                  return (
                    <div
                      key={step.index}
                      className="relative z-10 flex flex-col items-center"
                    >
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                          isDone
                            ? "bg-orange-500 text-white shadow-sm shadow-orange-500/30"
                            : "bg-gray-100 text-gray-400"
                        } ${isCurrent ? "ring-4 ring-orange-100" : ""}`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          step.index
                        )}
                      </div>
                      <span
                        className={`mt-1.5 text-[11px] font-semibold ${
                          isDone ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 雙欄版面：左側地圖，右側司機與訂單明細 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* 地圖區域 */}
          <div className="overflow-hidden rounded-3xl border border-gray-200/90 bg-white shadow-sm lg:col-span-7 xl:col-span-8">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-bold text-gray-900">
                  即時路線與司機座標
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  取件
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  送達
                </span>
                {order.driver && (
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-amber-500" />
                    司機
                  </span>
                )}
              </div>
            </div>

            <div
              ref={mapContainerRef}
              className="h-[360px] w-full sm:h-[460px]"
            />
          </div>

          {/* 右側資訊欄 */}
          <div className="space-y-4 lg:col-span-5 xl:col-span-4">
            {/* 司機資訊卡片 (當有司機時) */}
            {order.driver ? (
              <div className="rounded-3xl border border-orange-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                    <User className="h-4 w-4 text-orange-500" />
                    配送司機資訊
                  </span>
                  <div className="flex items-center gap-1.5">
                    {order.serviceType && (
                      <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                        {VEHICLE_NAMES[order.serviceType]?.name ||
                          order.serviceType}
                      </span>
                    )}
                    <span className="rounded-lg bg-orange-50 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-700">
                      車牌：{order.driver.plateNumber || "接單中"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 font-bold text-orange-700">
                      {order.driver.name.slice(0, 1) || "司"}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        {order.driver.name}
                      </h4>
                      <p className="font-mono text-xs text-gray-500">
                        {order.driver.phone}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 一鍵撥號與簡訊按鈕 */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={`tel:${order.driver.phone}`}
                    className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition hover:bg-emerald-600 active:scale-95"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    撥打電話
                  </a>
                  <a
                    href={`sms:${order.driver.phone}`}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    發送簡訊
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-5 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                  <RotateCw className="h-5 w-5 animate-spin" />
                </div>
                <h4 className="mt-2 text-xs font-bold text-gray-900">
                  司機即時媒合中
                </h4>
                <p className="mt-1 text-[11px] text-gray-500">
                  司機接單後，將在此即時顯示司機姓名、電話與車牌資訊。
                </p>
              </div>
            )}

            {/* 停靠點與地址詳情 */}
            <div className="rounded-3xl border border-gray-200/90 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-bold text-gray-900">
                配送路線地址
              </h3>

              <div className="space-y-3">
                {/* 取件點 */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                    起
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-gray-400">
                      取件地址 (寄件)
                    </span>
                    <p className="break-words text-xs font-medium text-gray-800">
                      {originStop?.address || "寄件地址"}
                    </p>
                    {originStop?.name && (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        聯絡人：{originStop.name} ({originStop.phone})
                      </p>
                    )}
                    {originStop?.remarks && (
                      <p className="mt-0.5 rounded-xl bg-gray-50 p-1.5 text-[10px] text-gray-600">
                        備註：{originStop.remarks}
                      </p>
                    )}
                  </div>
                </div>

                <div className="ml-2 h-4 border-l-2 border-dashed border-gray-200" />

                {/* 送件點 */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
                    訖
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-gray-400">
                      送達地址 (收件)
                    </span>
                    <p className="break-words text-xs font-medium text-gray-800">
                      {destStop?.address || "收件地址"}
                    </p>
                    {destStop?.name && (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        收件人：{destStop.name} ({destStop.phone})
                      </p>
                    )}
                    {destStop?.remarks && (
                      <p className="mt-0.5 rounded-xl bg-gray-50 p-1.5 text-[10px] text-gray-600">
                        備註：{destStop.remarks}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 費用明細卡片 */}
            <div className="rounded-3xl border border-gray-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <span className="text-xs font-bold text-gray-900">
                  費用與明細
                </span>
                <span className="font-ddin text-base font-bold text-orange-600">
                  NT$ {order.priceBreakdown?.total || 0}
                </span>
              </div>

              <div className="mt-2 space-y-1.5 text-xs text-gray-500">
                {order.serviceType && (
                  <div className="flex justify-between border-b border-gray-50 pb-1.5">
                    <span>配送車型</span>
                    <span className="font-semibold text-gray-800">
                      {VEHICLE_NAMES[order.serviceType]?.icon || "🚛"}{" "}
                      {VEHICLE_NAMES[order.serviceType]?.name ||
                        order.serviceType}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>基本起跳運費</span>
                  <span>NT$ {order.priceBreakdown?.base || 75}</span>
                </div>
                {Number(order.priceBreakdown?.extraMileage || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>超里程加價</span>
                    <span>NT$ {order.priceBreakdown?.extraMileage}</span>
                  </div>
                )}
                {Number(order.priceBreakdown?.surcharge || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>附加費 / 夜間加成</span>
                    <span>NT$ {order.priceBreakdown?.surcharge}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🧪 Sandbox 測試面板（僅開發環境顯示） */}
      {process.env.NEXT_PUBLIC_APP_ENV !== "production" && (
        <SandboxPanel
          orderId={order.orderId}
          onAction={(opt) => {
            if (opt) {
              mutate((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  status: opt.status || prev.status,
                  driver: opt.driverCoords
                    ? {
                        id: prev.driver?.id || "driver_sandbox",
                        name: prev.driver?.name || "Lalamove 司機",
                        phone: prev.driver?.phone || "0912345678",
                        plateNumber: prev.driver?.plateNumber || "ABC-8888",
                        coordinates: {
                          lat: opt.driverCoords.lat,
                          lng: opt.driverCoords.lng,
                        },
                      }
                    : prev.driver,
                };
              }, false);
            } else {
              mutate();
            }
          }}
        />
      )}

      {/* 取消訂單確認 Dialog */}
      <Dialog.Root
        open={isCancelModalOpen}
        onOpenChange={(open: boolean) => !open && setIsCancelModalOpen(false)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[201] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl focus:outline-none">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Ban className="h-6 w-6" />
            </div>
            <Dialog.Title className="mt-3 text-center text-base font-bold text-gray-900">
              確定要取消此筆 Lalamove 訂單？
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-center text-xs text-gray-500">
              取消後系統將立即終止媒合與配送，若司機已前往取件可能需重新發起。
            </Dialog.Description>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={isCancelling}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                暫不取消
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="flex items-center gap-1.5 rounded-2xl bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    正在取消中...
                  </>
                ) : (
                  "確定取消訂單"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
