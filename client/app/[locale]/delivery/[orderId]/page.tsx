"use client";

import { useRouter } from "@/i18n/navigation";
import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { deliveryStatusView, type DeliveryStage } from "@/utils/deliveryStatus";
import { ApiError } from "@/lib/apiError";
import { useApiErrorMessage } from "@/hooks/useApiErrorMessage";

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
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  if (!res.ok) {
    throw new ApiError(await res.json().catch(() => null), res.status);
  }
  const data = await res.json();
  return data.order as OrderDetail;
};

// 車型圖示；名稱在翻譯檔（Lalamove.vehicles 與 Delivery.vehicles）
const VEHICLE_ICONS: Record<string, string> = {
  MOTORCYCLE: "🛵",
  MOTORCYCLE_LARGELALABAG: "🛵",
  MOTORCYCLE_INTERCITY: "🏍️",
  SUV: "🚙",
  VAN: "🚐",
  TRUCK175: "🚚",
  TRUCK330: "🚛",
  TRUCK500: "🚛",
};

// 各階段徽章顏色
const STAGE_BADGE: Record<DeliveryStage, string> = {
  assigning: "bg-amber-500/10 border-amber-500/30 text-amber-600",
  toPickup: "bg-blue-500/10 border-blue-500/30 text-blue-600",
  inTransit: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
  delivered: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
  cancelled: "bg-rose-500/10 border-rose-500/30 text-rose-600",
  expired: "bg-gray-500/10 border-gray-500/30 text-gray-600",
  rejected: "bg-rose-500/10 border-rose-500/30 text-rose-600",
};

const STEPS = [
  { key: "created", index: 1 },
  { key: "matching", index: 2 },
  { key: "inTransit", index: 3 },
  { key: "delivered", index: 4 },
] as const;

export default function DeliveryTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("Delivery");
  const apiErrorMessage = useApiErrorMessage();
  const tLalamove = useTranslations("Lalamove");
  const orderId = (params?.orderId as string) || "";
  const { socket } = useSocketContext();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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
        if (!latestData) return 10000;
        if (deliveryStatusView(latestData.status).isFinal) {
          return 0; // 結束後停止輪詢
        }
        // 有 Webhook + Socket.IO 即時推播，輪詢僅作為背景備援（10 秒一次），避免轟炸 API
        return 10000;
      },
      revalidateOnFocus: true,
      dedupingInterval: 1000,
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return;
        if (retryCount >= 5) return;
        setTimeout(() => revalidate({ retryCount }), 3000);
      },
    },
  );

  // 提前計算 normalizedStatus，供 useEffect 與 JSX 共用（必須在任何使用它的 useEffect 之前宣告）
  const normalizedStatus = (order?.status || "").trim().toUpperCase();

  // 使用 Ref 記住最新的 order 與 normalizedStatus，供 Socket 回呼存取，避免每次 order 變動重新綁定 Socket 監聽器
  const latestOrderRef = useRef(order);
  const latestStatusRef = useRef(normalizedStatus);
  useEffect(() => {
    latestOrderRef.current = order;
    latestStatusRef.current = normalizedStatus;
  }, [order, normalizedStatus]);

  // 監聽 Socket.IO 即時更新事件
  useEffect(() => {
    if (!socket || !orderId) return;

    socket.emit("join_delivery", orderId);

    const handleDeliveryUpdate = (updateData: unknown) => {
      console.log("⚡ [Socket] Received delivery_update:", updateData);
      const update = updateData as {
        status?: string;
        driver?: {
          name?: string;
          phone?: string;
          plateNumber?: string;
          coordinates?: { lat: string | number; lng: string | number };
        };
        coordinates?: { lat: string | number; lng: string | number };
      };

      // 1. 若收到即時座標更新，直接在 Google Maps 上平滑移動 Marker，零延遲
      const rawCoords = update.coordinates || update.driver?.coordinates;
      if (rawCoords && driverMarkerRef.current && window.google?.maps) {
        const newPos = {
          lat: Number(rawCoords.lat),
          lng: Number(rawCoords.lng),
        };
        driverMarkerRef.current.setPosition(newPos);

        // 同步移動前往下一個目標站點的虛線
        if (driverPolylineRef.current) {
          const currentOrder = latestOrderRef.current;
          const currentStatus = latestStatusRef.current;
          const stops = currentOrder?.stops || [];
          const origin = stops[0]?.coordinates;
          const dest = stops[stops.length - 1]?.coordinates;
          const targetCoords =
            deliveryStatusView(currentStatus).stage === "inTransit"
              ? dest
              : origin;
          if (targetCoords) {
            driverPolylineRef.current.setPath([
              newPos,
              { lat: Number(targetCoords.lat), lng: Number(targetCoords.lng) },
            ]);
          }
        }
      }

      // 2. 樂觀同步至 SWR 快取，供 UI 狀態文字與卡片即時顯示，不發起網路請求
      if (update.status || update.driver || update.coordinates) {
        mutate(
          (current) => {
            if (!current) return current;
            const updatedDriver =
              update.driver ||
              (update.coordinates ? { coordinates: update.coordinates } : null);

            return {
              ...current,
              ...(update.status ? { status: update.status } : {}),
              ...(updatedDriver
                ? {
                    driver: {
                      ...(current.driver ?? {
                        id: "",
                        name: "",
                        phone: "",
                        plateNumber: "",
                      }),
                      ...(updatedDriver.name
                        ? { name: updatedDriver.name }
                        : {}),
                      ...(updatedDriver.phone
                        ? { phone: updatedDriver.phone }
                        : {}),
                      ...(updatedDriver.plateNumber
                        ? { plateNumber: updatedDriver.plateNumber }
                        : {}),
                      ...(updatedDriver.coordinates
                        ? {
                            coordinates: {
                              lat: String(updatedDriver.coordinates.lat),
                              lng: String(updatedDriver.coordinates.lng),
                            },
                          }
                        : {}),
                    },
                  }
                : {}),
            };
          },
          { revalidate: false },
        );
      } else {
        mutate();
      }
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
        title: t("markerPickup"),
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
        title: t("markerDropoff"),
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
          title: t("markerDriver", {
            name: order.driver?.name || t("driverFallback"),
          }),
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
        deliveryStatusView(normalizedStatus).stage === "inTransit"
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
  }, [order, mapReady, normalizedStatus, t]);

  // 取消訂單處理
  const handleCancelOrder = async () => {
    if (!orderId) return;
    try {
      setIsCancelling(true);
      const res = await fetch(`${hostName}/api/lalamove/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(apiErrorMessage(data, t("cancelFailed")));
      }
      toast.success(t("cancelled"));
      setIsCancelModalOpen(false);
      mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("cancelFailed");
      toast.error(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  // 複製連結（優先複製 Lalamove 官方免登入的 shareLink）
  const copyTrackingLink = () => {
    const targetUrl =
      order?.shareLink ||
      (typeof window !== "undefined" ? window.location.href : "");
    if (navigator.clipboard && targetUrl) {
      navigator.clipboard.writeText(targetUrl);
      if (order?.shareLink) {
        toast.success(t("copiedPublicLink"));
      } else {
        toast.success(t("copiedLink"));
      }
    }
  };

  if (isLoading || (!order && !error)) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-3xl bg-orange-50 text-orange-500 shadow-sm">
          <Truck className="h-8 w-8" />
        </div>
        <p className="mt-4 font-semibold text-gray-700">{t("loading")}</p>
      </div>
    );
  }

  if (error || !order) {
    const status = error instanceof ApiError ? error.status : undefined;
    const isAuthError = status === 401;
    const isForbidden = status === 403;

    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-gray-900">
          {isAuthError
            ? t("signInTitle")
            : isForbidden
              ? t("forbiddenTitle")
              : t("notFoundTitle")}
        </h2>
        <p className="mt-2 text-xs text-gray-500">
          {isAuthError
            ? t("signInBody")
            : isForbidden
              ? t("forbiddenBody")
              : status === 404
                ? t("notFoundBody")
                : apiErrorMessage(error, t("loadFailed"))}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {isAuthError ? (
            <button
              type="button"
              onClick={() => router.push("/signin")}
              className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-600"
            >
              {t("goSignIn")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-600"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("backHome")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const statusView = deliveryStatusView(order.status);
  const isCancellable = statusView.isCancellable;
  const vehicleIcon = (type: string) => VEHICLE_ICONS[type] || "🚛";
  const vehicleName = (type: string) => {
    const quoted = `vehicles.${type}.name`;
    if (tLalamove.has(quoted as Parameters<typeof tLalamove>[0])) {
      return tLalamove(quoted as Parameters<typeof tLalamove>[0]);
    }
    const extra = `vehicles.${type}`;
    if (t.has(extra as Parameters<typeof t>[0])) {
      return t(extra as Parameters<typeof t>[0]);
    }
    return type;
  };
  const price = (amount: string | number | undefined, fallback = 0) =>
    t("price", { amount: Number(amount) || fallback });
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
              aria-label={t("back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-gray-500">
                  {t("orderNumber")}
                </span>
                <span className="font-mono text-xs font-extrabold text-gray-900">
                  #{order.orderId}
                </span>
                {order.serviceType && (
                  <span className="flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
                    <span>{vehicleIcon(order.serviceType)}</span>
                    <span>{vehicleName(order.serviceType)}</span>
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-gray-900 sm:text-xl">
                {t("title")}
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
                <span>{t("officialTracking")}</span>
              </a>
            )}

            {/* 複製追蹤網址按鈕 */}
            <button
              type="button"
              onClick={copyTrackingLink}
              className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Share2 className="h-3.5 w-3.5 text-gray-500" />
              <span className="hidden sm:inline">{t("shareLink")}</span>
            </button>

            {/* 手動重整 */}
            <button
              type="button"
              onClick={() => mutate()}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 active:scale-95"
              title={t("refresh")}
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
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STAGE_BADGE[statusView.stage]}`}
                  >
                    {t(`stages.${statusView.stage}.badge`)}
                  </span>
                  <span className="text-xs text-gray-400">{t("liveSync")}</span>
                </div>
                <h2 className="mt-1 text-base font-extrabold text-gray-900 sm:text-lg">
                  {t(`stages.${statusView.stage}.label`)}
                </h2>
                <p className="text-xs text-gray-500">
                  {t(`stages.${statusView.stage}.desc`)}
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
                {t("cancelOrder")}
              </button>
            )}
          </div>

          {/* 流程進度條 (Stepper) */}
          {statusView.step > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <div className="relative grid grid-cols-4 gap-2 text-center text-xs">
                {/* 橫向進度線條 */}
                <div className="absolute left-[12.5%] right-[12.5%] top-3.5 -z-0 h-1 -translate-y-1/2 bg-gray-200">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{
                      width: `${((Math.min(statusView.step, 4) - 1) / 3) * 100}%`,
                    }}
                  />
                </div>

                {STEPS.map((step) => {
                  const isDone = statusView.step >= step.index;
                  const isCurrent = statusView.step === step.index;
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
                        {t(`steps.${step.key}`)}
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
                  {t("mapTitle")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {t("legendPickup")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  {t("legendDropoff")}
                </span>
                {order.driver && (
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-amber-500" />
                    {t("legendDriver")}
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
                    {t("driverInfo")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {order.serviceType && (
                      <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                        {vehicleName(order.serviceType)}
                      </span>
                    )}
                    <span className="rounded-lg bg-orange-50 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-700">
                      {t("plate", {
                        plate: order.driver.plateNumber || t("platePending"),
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 font-bold text-orange-700">
                      {order.driver.name.slice(0, 1) ||
                        t("driverInitialFallback")}
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
                    {t("call")}
                  </a>
                  <a
                    href={`sms:${order.driver.phone}`}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t("sms")}
                  </a>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-5 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                  <RotateCw className="h-5 w-5 animate-spin" />
                </div>
                <h4 className="mt-2 text-xs font-bold text-gray-900">
                  {t("matchingTitle")}
                </h4>
                <p className="mt-1 text-[11px] text-gray-500">
                  {t("matchingBody")}
                </p>
              </div>
            )}

            {/* 停靠點與地址詳情 */}
            <div className="rounded-3xl border border-gray-200/90 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-bold text-gray-900">
                {t("routeTitle")}
              </h3>

              <div className="space-y-3">
                {/* 取件點 */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                    {t("originBadge")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-gray-400">
                      {t("pickupAddress")}
                    </span>
                    <p className="break-words text-xs font-medium text-gray-800">
                      {originStop?.address || t("pickupFallback")}
                    </p>
                    {originStop?.name && (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {t("contact", {
                          name: originStop.name,
                          phone: originStop.phone ?? "",
                        })}
                      </p>
                    )}
                    {originStop?.remarks && (
                      <p className="mt-0.5 rounded-xl bg-gray-50 p-1.5 text-[10px] text-gray-600">
                        {t("remarks", { remarks: originStop.remarks })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="ml-2 h-4 border-l-2 border-dashed border-gray-200" />

                {/* 送件點 */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
                    {t("destinationBadge")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold text-gray-400">
                      {t("dropoffAddress")}
                    </span>
                    <p className="break-words text-xs font-medium text-gray-800">
                      {destStop?.address || t("dropoffFallback")}
                    </p>
                    {destStop?.name && (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {t("recipient", {
                          name: destStop.name,
                          phone: destStop.phone ?? "",
                        })}
                      </p>
                    )}
                    {destStop?.remarks && (
                      <p className="mt-0.5 rounded-xl bg-gray-50 p-1.5 text-[10px] text-gray-600">
                        {t("remarks", { remarks: destStop.remarks })}
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
                  {t("fareTitle")}
                </span>
                <span className="font-ddin text-base font-bold text-orange-600">
                  {price(order.priceBreakdown?.total)}
                </span>
              </div>

              <div className="mt-2 space-y-1.5 text-xs text-gray-500">
                {order.serviceType && (
                  <div className="flex justify-between border-b border-gray-50 pb-1.5">
                    <span>{t("vehicle")}</span>
                    <span className="font-semibold text-gray-800">
                      {vehicleIcon(order.serviceType)}{" "}
                      {vehicleName(order.serviceType)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{t("baseFare")}</span>
                  <span>{price(order.priceBreakdown?.base, 75)}</span>
                </div>
                {Number(order.priceBreakdown?.extraMileage || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>{t("extraMileage")}</span>
                    <span>{price(order.priceBreakdown?.extraMileage)}</span>
                  </div>
                )}
                {Number(order.priceBreakdown?.surcharge || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>{t("surcharge")}</span>
                    <span>{price(order.priceBreakdown?.surcharge)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🧪 Sandbox 測試面板（僅開發環境顯示） */}
      {process.env.NEXT_PUBLIC_APP_ENV === "development" && (
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
                        name: prev.driver?.name || t("driverFallback"),
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
              {t("cancelDialogTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-center text-xs text-gray-500">
              {t("cancelDialogBody")}
            </Dialog.Description>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                disabled={isCancelling}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                {t("keepOrder")}
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
                    {t("cancelling")}
                  </>
                ) : (
                  t("confirmCancel")
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
