import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Post } from "@/app/types/schema";
import {
  Truck,
  MapPin,
  Phone,
  User,
  FileText,
  RotateCw,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  X,
  Edit3,
  Check,
  Bike,
  Car,
} from "lucide-react";
import toast from "react-hot-toast";
import QuotationSummaryCard from "./QuotationSummaryCard";
import { useUser } from "@/app/contexts/UserContext";

// FIXME: [Lalamove TW API Limitation] In Taipei, TRUCK175 and TRUCK330 yield the same quotation due to API merging 1.75T/3.49T into TRUCK330.
export const VEHICLE_OPTIONS = [
  {
    id: "MOTORCYCLE",
    name: "機車",
    nameEn: "Motorcycle",
    desc: "40×40×40 cm / 20kg 內（文件、小型包裹、餐點）",
    icon: "bike",
  },
  {
    id: "SUV",
    name: "廂型貨車（半車）",
    nameEn: "Van (Half)",
    desc: "100×100×100 cm / 200kg 內（中型物資、行李箱）",
    icon: "car",
  },
  {
    id: "VAN",
    name: "廂型貨車（全車）",
    nameEn: "Van (Full)",
    desc: "150×100×100 cm / 300kg 內（學生搬宿、多箱行李）",
    icon: "van",
  },
  {
    id: "TRUCK175",
    name: "1.75噸 貨車",
    nameEn: "1.75T Truck",
    desc: "200×120×120 cm / 500kg 內（小家庭、租屋搬家）",
    icon: "truck",
  },
  {
    id: "TRUCK330",
    name: "3.49噸 貨車",
    nameEn: "3.49T Truck",
    desc: "300×150×150 cm / 1,000kg 內（家庭搬遷、辦公室大件）",
    icon: "truck",
  },
];

export interface QuotationItem {
  quotationId: string;
  serviceType: string;
  serviceName?: string;
  serviceDescription?: string;
  expiresAt: string;
  priceBreakdown: {
    total: string;
    currency: string;
    base?: string;
    extraMileage?: string;
    surcharge?: string;
  };
  distance: {
    value: string;
    unit: string;
  };
  durationMins?: number;
  stops?: Array<{
    id?: string;
    coordinates: {
      lat: string | number;
      lng: string | number;
    };
    address: string;
  }>;
}

interface OrderPlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: QuotationItem | null;
  allQuotations?: Record<string, QuotationItem>;
  onQuotationsUpdate?: (
    quotes: Record<string, QuotationItem>,
    activeQuote: QuotationItem,
    newOriginAddress?: string,
    newDestAddress?: string,
  ) => void;
  post: Post;
  originAddress: string;
  destinationAddress: string;
  originPlaceId?: string;
  destinationPlaceId?: string;
  destinationCoords?: { lat: number; lng: number };
  currentUser?: {
    username?: string;
    email?: string;
  } | null;
  locale?: "en" | "zh";
}

function sanitizeTwAddress(address: string): string {
  return address
    .replace(
      /[\s,，]*[Bb]?\d*[Bb]?[Ff1lL]?[\s]*(?:樓|F|f|FL|fl)(?:之\d+)?/g,
      "",
    )
    .replace(/號號/g, "號")
    .replace(/(號)\s*號/g, "$1")
    .replace(/[,，\s]+$/g, "")
    .trim();
}

/**
 * 透過 Google Geocoder 將使用者輸入的地址字串解析為經緯度 (lat, lng)
 */
const geocodeAddress = async (
  address: string,
): Promise<{ lat: number; lng: number } | null> => {
  if (typeof window === "undefined" || !window.google?.maps?.Geocoder) {
    return null;
  }
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address, componentRestrictions: { country: "tw" } },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      },
    );
  });
};

export const OrderPlacementModal: React.FC<OrderPlacementModalProps> = ({
  isOpen,
  onClose,
  quotation: initialQuotation,
  allQuotations,
  onQuotationsUpdate,
  post,
  originAddress: initialOriginAddress,
  destinationAddress: initialDestinationAddress,
  originPlaceId: initialOriginPlaceId,
  destinationPlaceId: initialDestinationPlaceId,
  destinationCoords: initialDestinationCoords,
  currentUser,
  locale = "zh",
}) => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

  const [currentQuotation, setCurrentQuotation] =
    useState<QuotationItem | null>(initialQuotation);
  const [quotesMap, setQuotesMap] = useState<Record<string, QuotationItem>>(
    allQuotations || {},
  );
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);

  // 地址狀態
  const [originAddr, setOriginAddr] = useState(initialOriginAddress);
  const [destAddr, setDestAddr] = useState(initialDestinationAddress);
  // 取件地點的 Google place_id（初始來自 props 或 post，使用者若重新選取會更新）
  const [originPlaceId, setOriginPlaceId] = useState<string | undefined>(
    initialOriginPlaceId || post.place_id || undefined,
  );
  // 送達地點的 Google place_id（由外部 autocomplete 或 GPS 取得，或在 modal 內選取時更新）
  const [destPlaceId, setDestPlaceId] = useState<string | undefined>(
    initialDestinationPlaceId,
  );
  const [originCoords, setOriginCoords] = useState<{
    lat: number;
    lng: number;
  }>({
    lat: Number(
      initialQuotation?.stops?.[0]?.coordinates?.lat ?? post.lat ?? 25.0831,
    ),
    lng: Number(
      initialQuotation?.stops?.[0]?.coordinates?.lng ?? post.lng ?? 121.5452,
    ),
  });
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number }>({
    lat: Number(
      initialDestinationCoords?.lat ??
        initialQuotation?.stops?.[1]?.coordinates?.lat ??
        24.9924,
    ),
    lng: Number(
      initialDestinationCoords?.lng ??
        initialQuotation?.stops?.[1]?.coordinates?.lng ??
        121.5203,
    ),
  });
  const [isEditingAddresses, setIsEditingAddresses] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // 聯絡人狀態
  const [senderName, setSenderName] = useState(post.username || "寄件人");
  const [senderPhone, setSenderPhone] = useState("+886912345678");
  const [senderFloorUnit, setSenderFloorUnit] = useState("");
  const [senderRemarks, setSenderRemarks] = useState("");

  const [recipientName, setRecipientName] = useState(
    currentUser?.username || "收件人",
  );
  const [recipientPhone, setRecipientPhone] = useState("+886987654321");
  const [recipientFloorUnit, setRecipientFloorUnit] = useState("");
  const [recipientRemarks, setRecipientRemarks] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const originInputRef = useRef<HTMLInputElement | null>(null);
  const destInputRef = useRef<HTMLInputElement | null>(null);

  const handleExpireChange = useCallback((expired: boolean) => {
    setIsQuoteExpired(expired);
  }, []);

  // 當彈窗開啟瞬間初始化表單資料（避免在彈窗內部重算時被重新覆蓋）
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    const wasJustOpened = !prevIsOpenRef.current && isOpen;
    prevIsOpenRef.current = isOpen;

    if (wasJustOpened) {
      setCurrentQuotation(initialQuotation);
      if (allQuotations && Object.keys(allQuotations).length > 0) {
        setQuotesMap(allQuotations);
      } else if (initialQuotation) {
        setQuotesMap({ [initialQuotation.serviceType]: initialQuotation });
      }
      setOriginAddr(initialOriginAddress);
      setDestAddr(initialDestinationAddress);
      setOriginPlaceId(initialOriginPlaceId || post.place_id || undefined);
      setDestPlaceId(initialDestinationPlaceId);
      setOriginCoords({
        lat: Number(
          initialQuotation?.stops?.[0]?.coordinates?.lat ?? post.lat ?? 25.0831,
        ),
        lng: Number(
          initialQuotation?.stops?.[0]?.coordinates?.lng ??
            post.lng ??
            121.5452,
        ),
      });
      setDestCoords({
        lat: Number(
          initialDestinationCoords?.lat ??
            initialQuotation?.stops?.[1]?.coordinates?.lat ??
            24.9924,
        ),
        lng: Number(
          initialDestinationCoords?.lng ??
            initialQuotation?.stops?.[1]?.coordinates?.lng ??
            121.5203,
        ),
      });
      setIsQuoteExpired(false);
      setIsEditingAddresses(false);
      setErrorMessage("");
    }
  }, [
    isOpen,
    initialQuotation,
    allQuotations,
    initialOriginAddress,
    initialDestinationAddress,
    initialOriginPlaceId,
    initialDestinationPlaceId,
    initialDestinationCoords,
    post.lat,
    post.lng,
    post.place_id,
  ]);

  // Google Places Autocomplete 綁定
  useEffect(() => {
    if (!isOpen || !isEditingAddresses || typeof window === "undefined") return;
    if (!window.google?.maps?.places) return;

    let autoOrigin: google.maps.places.Autocomplete | null = null;
    let autoDest: google.maps.places.Autocomplete | null = null;

    if (originInputRef.current) {
      autoOrigin = new window.google.maps.places.Autocomplete(
        originInputRef.current,
        {
          componentRestrictions: { country: "tw" },
          fields: ["formatted_address", "name", "geometry", "place_id"],
        },
      );
      autoOrigin.addListener("place_changed", () => {
        const place = autoOrigin?.getPlace();
        const addr = place?.formatted_address || place?.name;
        if (addr) {
          setOriginAddr(addr);
        }
        if (place?.place_id) {
          setOriginPlaceId(place.place_id);
        }
        if (place?.geometry?.location) {
          setOriginCoords({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        }
      });
    }

    if (destInputRef.current) {
      autoDest = new window.google.maps.places.Autocomplete(
        destInputRef.current,
        {
          componentRestrictions: { country: "tw" },
          fields: ["formatted_address", "name", "geometry", "place_id"],
        },
      );
      autoDest.addListener("place_changed", () => {
        const place = autoDest?.getPlace();
        const addr = place?.formatted_address || place?.name;
        if (addr) {
          setDestAddr(addr);
        }
        if (place?.place_id) {
          setDestPlaceId(place.place_id);
        }
        if (place?.geometry?.location) {
          setDestCoords({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
        }
      });
    }

    return () => {
      if (window.google?.maps?.event) {
        if (autoOrigin)
          window.google.maps.event.clearInstanceListeners(autoOrigin);
        if (autoDest) window.google.maps.event.clearInstanceListeners(autoDest);
      }
    };
  }, [isOpen, isEditingAddresses]);

  // 批量重新試算所有車型運費（並更新 quotesMap 與 currentQuotation）
  const handleBatchRecalculate = async (targetServiceType?: string) => {
    if (!originAddr.trim() || !destAddr.trim()) {
      setErrorMessage("取件與送達地址皆不能為空");
      return;
    }

    try {
      setIsRecalculating(true);
      setErrorMessage("");

      // 檢查使用者是否手動修改了地址字串，若是則透過 Geocoder 解析最新的經緯度
      let finalOriginLat = originCoords.lat;
      let finalOriginLng = originCoords.lng;
      const geocodedOrigin = await geocodeAddress(originAddr);
      if (geocodedOrigin) {
        finalOriginLat = geocodedOrigin.lat;
        finalOriginLng = geocodedOrigin.lng;
        setOriginCoords(geocodedOrigin);
      }

      let finalDestLat = destCoords.lat;
      let finalDestLng = destCoords.lng;
      const geocodedDest = await geocodeAddress(destAddr);
      if (geocodedDest) {
        finalDestLat = geocodedDest.lat;
        finalDestLng = geocodedDest.lng;
        setDestCoords(geocodedDest);
      }

      const stops = [
        {
          coordinates: {
            lat: Number(finalOriginLat).toFixed(6),
            lng: Number(finalOriginLng).toFixed(6),
          },
          address: sanitizeTwAddress(originAddr),
        },
        {
          coordinates: {
            lat: Number(finalDestLat).toFixed(6),
            lng: Number(finalDestLng).toFixed(6),
          },
          address: sanitizeTwAddress(destAddr),
        },
      ];

      const res = await fetch(`${hostName}/api/lalamove/quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypes: ["MOTORCYCLE", "SUV", "VAN", "TRUCK175", "TRUCK330"],
          stops,
          language: locale === "en" ? "en_TW" : "zh_TW",
        }),
      });

      const data = await res.json();
      if (
        !res.ok ||
        !data.success ||
        !data.quotations ||
        data.quotations.length === 0
      ) {
        throw new Error(data.message || data.error || "重新計算報價失敗");
      }

      const quotesMapNew: Record<string, QuotationItem> = {};
      data.quotations.forEach((q: QuotationItem) => {
        quotesMapNew[q.serviceType] = q;
      });

      // 雙北與中南部 TRUCK330/TRUCK175 互補
      if (quotesMapNew["TRUCK330"] && !quotesMapNew["TRUCK175"]) {
        quotesMapNew["TRUCK175"] = {
          ...quotesMapNew["TRUCK330"],
          serviceType: "TRUCK175",
        };
      }
      if (quotesMapNew["TRUCK175"] && !quotesMapNew["TRUCK330"]) {
        quotesMapNew["TRUCK330"] = {
          ...quotesMapNew["TRUCK175"],
          serviceType: "TRUCK330",
        };
      }

      setQuotesMap(quotesMapNew);
      setIsQuoteExpired(false);
      setIsEditingAddresses(false);

      const activeType =
        targetServiceType || currentQuotation?.serviceType || "MOTORCYCLE";
      const activeQuote =
        quotesMapNew[activeType] ||
        (activeType === "TRUCK175" ? quotesMapNew["TRUCK330"] : undefined) ||
        (activeType === "TRUCK330" ? quotesMapNew["TRUCK175"] : undefined) ||
        data.quotations[0];

      if (activeQuote) {
        setCurrentQuotation(activeQuote);
        onQuotationsUpdate?.(quotesMapNew, activeQuote);
      }

      toast.success(
        locale === "en"
          ? "Fare quotes updated for all vehicles!"
          : "所有車型運費報價已更新！",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "重新計算報價失敗";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsRecalculating(false);
    }
  };

  // 切換配送車型：未過期時 0 秒無縫切換，過期或無快取時觸發批量請求
  const handleSwitchVehicle = (targetServiceType: string) => {
    if (targetServiceType === currentQuotation?.serviceType) return;
    const existing =
      quotesMap[targetServiceType] ||
      (targetServiceType === "TRUCK175" ? quotesMap["TRUCK330"] : undefined) ||
      (targetServiceType === "TRUCK330" ? quotesMap["TRUCK175"] : undefined);

    if (!isQuoteExpired && existing) {
      // 0ms 無縫切換
      setCurrentQuotation(existing);
      onQuotationsUpdate?.(quotesMap, existing);
      // const vehicleObj = VEHICLE_OPTIONS.find(
      //   (v) => v.id === targetServiceType,
      // );
      // toast.success(`已切換為 ${vehicleObj?.name || targetServiceType}`);
    } else {
      // 已過期或無快取 -> 批量重新請求所有車種
      handleBatchRecalculate(targetServiceType);
    }
  };

  // 格式化電話
  const formatPhone = (phone: string): string => {
    let p = phone.trim();
    if (p.startsWith("09")) {
      p = "+886" + p.slice(1);
    }
    if (!p.startsWith("+")) {
      p = "+886" + p;
    }
    return p;
  };

  const { user: contextUser } = useUser();
  const effectiveUser = currentUser || contextUser;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    // 檢查登入狀態，未登入則引導至登入頁面並記錄 returnTo
    if (!effectiveUser) {
      const currentPath =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/";
      toast.error(
        locale === "en"
          ? "Please sign in before checking out."
          : "請先登入後再進行結帳付款",
      );
      router.push(`/signin?returnTo=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (!currentQuotation) {
      setErrorMessage("請先取得有效報價");
      return;
    }
    if (
      isQuoteExpired ||
      (currentQuotation.expiresAt &&
        new Date(currentQuotation.expiresAt).getTime() <= Date.now())
    ) {
      setErrorMessage(
        locale === "en"
          ? "Fare quotation has expired. Please recalculate."
          : "運費報價已過期，請點擊「重新試算」更新報價後再送出",
      );
      setIsQuoteExpired(true);
      return;
    }
    if (!senderName.trim()) {
      setErrorMessage(
        locale === "en" ? "Sender name is required" : "請填寫寄件人姓名",
      );
      return;
    }
    if (!senderPhone.trim()) {
      setErrorMessage(
        locale === "en" ? "Sender phone is required" : "請填寫寄件人手機電話",
      );
      return;
    }
    if (!recipientName.trim()) {
      setErrorMessage(
        locale === "en" ? "Recipient name is required" : "請填寫收件人姓名",
      );
      return;
    }
    if (!recipientPhone.trim()) {
      setErrorMessage(
        locale === "en"
          ? "Recipient phone is required"
          : "請填寫收件人手機電話",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const senderFullRemarks = [
        senderFloorUnit ? `樓層門牌：${senderFloorUnit}` : "",
        senderRemarks,
      ]
        .filter(Boolean)
        .join("，");

      const recipientFullRemarks = [
        recipientFloorUnit ? `樓層門牌：${recipientFloorUnit}` : "",
        recipientRemarks,
      ]
        .filter(Boolean)
        .join("，");

      // 呼叫金流結帳 API
      const checkoutPayload = {
        postId: post.id,
        serviceType: currentQuotation.serviceType,
        quotationId: currentQuotation.quotationId,
        feeTotal: Number(currentQuotation.priceBreakdown.total),
        expiresAt: currentQuotation.expiresAt,
        // 取件地點：附帶 place_id（來自 post 或使用者重新選取後更新）
        pickup: {
          fullAddress: sanitizeTwAddress(originAddr),
          lat: originCoords.lat,
          lng: originCoords.lng,
          placeId: originPlaceId,
        },
        pickupRemarks: senderFullRemarks || undefined,
        // 送達地點：附帶 place_id（由 Google Places Autocomplete 取得）
        dropoff: {
          fullAddress: sanitizeTwAddress(destAddr),
          lat: destCoords.lat,
          lng: destCoords.lng,
          placeId: destPlaceId,
        },
        dropoffRemarks: recipientFullRemarks || undefined,
        senderName: senderName.trim(),
        senderPhone: formatPhone(senderPhone),
        recipientName: recipientName.trim(),
        recipientPhone: formatPhone(recipientPhone),
      };

      const response = await fetch(`${hostName}/api/payments/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(checkoutPayload),
      });

      // 若未登入或 Session 過期，自動跳轉至登入頁面並帶上 returnTo
      if (response.status === 401) {
        const currentPath =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/";
        toast.error(
          locale === "en"
            ? "Session expired. Please sign in again."
            : "登入已逾期，請重新登入",
        );
        router.push(`/signin?returnTo=${encodeURIComponent(currentPath)}`);
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || "建立結帳訂單失敗");
      }

      // 儲存 MerchantTradeNo 與當前貼文網址到 sessionStorage，供付款後查詢與返回
      const tradeNo = data.session?.formData?.MerchantTradeNo;
      if (typeof window !== "undefined") {
        if (tradeNo) sessionStorage.setItem("lastMerchantTradeNo", tradeNo);
        sessionStorage.setItem("lastPostUrl", window.location.pathname + window.location.search);
      }

      toast.success(
        locale === "en"
          ? "Redirecting to secure payment..."
          : "正在跳轉至綠界安全結帳頁面...",
      );

      // 注入綠界自動跳轉 Form 並送出，瀏覽器將被導向綠界付款頁
      const htmlForm = data.session?.htmlForm as string | undefined;
      if (htmlForm) {
        const container = document.createElement("div");
        container.innerHTML = htmlForm;
        document.body.appendChild(container);
        const form = container.querySelector("form");
        if (form) {
          form.submit();
          return; // 頁面即將跳轉，不需再執行後續程式
        }
      }

      throw new Error("未收到有效的付款表單，請重試");
    } catch (err: unknown) {
      console.error("Checkout failed:", err);
      const msg = err instanceof Error ? err.message : "下單失敗，請稍後再試";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentQuotation) return null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open: boolean) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.(".pac-container")) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.(".pac-container")) {
              e.preventDefault();
            }
          }}
          className="fixed left-1/2 top-1/2 z-[201] max-h-[92vh] w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl focus:outline-none sm:p-6"
        >
          {/* Ensure Google Autocomplete suggestions stay on top of the dialog and accept clicks */}
          <style>{`
            .pac-container {
              z-index: 999999 !important;
              pointer-events: auto !important;
            }
          `}</style>
          <div className="flex items-start justify-between pb-2">
            <div className="flex items-center gap-2.5 text-orange-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-bold text-gray-900 sm:text-lg">
                  {locale === "en"
                    ? "Confirm Lalamove Delivery Order"
                    : "確認 Lalamove 配送訂單"}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-gray-500">
                  {locale === "en"
                    ? "Confirm details, vehicle type, edit addresses or remarks."
                    : "可在此切換車型、修改地址與聯絡人資訊。"}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmitOrder} className="mt-2 space-y-3.5">
            {/* 1. 取件 / 寄件人資訊 */}
            <div className="rounded-2xl border border-gray-200 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <MapPin className="h-3 w-3" />
                  </div>
                  <h4 className="text-xs font-bold text-gray-900">
                    {locale === "en"
                      ? "1. Pickup / Sender Info"
                      : "1. 取件 / 寄件人資訊"}
                  </h4>
                </div>

                {!isEditingAddresses ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingAddresses(true)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700"
                  >
                    <Edit3 className="h-3 w-3" />
                    修改地址
                  </button>
                ) : null}
              </div>

              {/* 地址區塊（支援直接編輯與重新試算） */}
              {isEditingAddresses ? (
                <div className="mb-3 space-y-2 rounded-xl border border-orange-200/60 bg-orange-50/50 p-2.5">
                  <label className="block text-[11px] font-semibold text-orange-800">
                    修改取件地址：
                  </label>
                  <input
                    ref={originInputRef}
                    type="text"
                    value={originAddr}
                    onChange={(e) => setOriginAddr(e.target.value)}
                    placeholder="輸入新取件地址"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
              ) : (
                <p className="mb-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">
                    取件地址：
                  </span>
                  {originAddr}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    寄件人姓名 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="例：王小明"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    寄件人電話 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="tel"
                      required
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      placeholder="例：0912345678"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    取件樓層 / 門牌 (選填)
                  </label>
                  <input
                    type="text"
                    value={senderFloorUnit}
                    onChange={(e) => setSenderFloorUnit(e.target.value)}
                    placeholder="例：3樓之1、A棟"
                    className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    取件備註給司機 (選填)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={senderRemarks}
                      onChange={(e) => setSenderRemarks(e.target.value)}
                      placeholder="例：請按電鈴、放置管理室"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 送達 / 收件人資訊 */}
            <div className="rounded-2xl border border-gray-200 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                    <MapPin className="h-3 w-3" />
                  </div>
                  <h4 className="text-xs font-bold text-gray-900">
                    {locale === "en"
                      ? "2. Drop-off / Recipient Info"
                      : "2. 送達 / 收件人資訊"}
                  </h4>
                </div>

                {!isEditingAddresses ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingAddresses(true)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700"
                  >
                    <Edit3 className="h-3 w-3" />
                    修改地址
                  </button>
                ) : null}
              </div>

              {/* 地址區塊（支援直接編輯與重新試算） */}
              {isEditingAddresses ? (
                <div className="mb-3 space-y-2 rounded-xl border border-orange-200/60 bg-orange-50/50 p-2.5">
                  <label className="block text-[11px] font-semibold text-orange-800">
                    修改送達地址：
                  </label>
                  <input
                    ref={destInputRef}
                    type="text"
                    value={destAddr}
                    onChange={(e) => setDestAddr(e.target.value)}
                    placeholder="輸入新送達地址"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
              ) : (
                <p className="mb-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">
                    送達地址：
                  </span>
                  {destAddr}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    收件人姓名 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="例：陳大華"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    收件人電話 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="tel"
                      required
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="例：0987654321"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    送達樓層 / 門牌 (選填)
                  </label>
                  <input
                    type="text"
                    value={recipientFloorUnit}
                    onChange={(e) => setRecipientFloorUnit(e.target.value)}
                    placeholder="例：5樓之2、管理室"
                    className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">
                    送件備註給司機 (選填)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={recipientRemarks}
                      onChange={(e) => setRecipientRemarks(e.target.value)}
                      placeholder="例：到達前先電聯、門口鞋櫃"
                      className="w-full rounded-xl border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 若處於編輯地址模式，顯示「確認新地址並重新計算運費」按鈕 */}
            {isEditingAddresses && (
              <div className="flex items-center justify-end gap-2 rounded-2xl bg-orange-50 p-3">
                <button
                  type="button"
                  onClick={() => setIsEditingAddresses(false)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  取消修改
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchRecalculate()}
                  disabled={isRecalculating}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"
                >
                  {isRecalculating ? (
                    <>
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      重新計算中...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      儲存新地址並重算運費
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 3. 配送車型切換 (Vehicle Selector) */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800">
                  {locale === "en" ? "Select Vehicle Type" : "選擇配送車型"}
                </span>
                {isRecalculating && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600">
                    <RotateCw className="h-3 w-3 animate-spin" />
                    重新計算中...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VEHICLE_OPTIONS.map((v) => {
                  const isSelected = currentQuotation.serviceType === v.id;
                  const quoteForVehicle =
                    quotesMap[v.id] ||
                    (v.id === "TRUCK175" ? quotesMap["TRUCK330"] : undefined) ||
                    (v.id === "TRUCK330" ? quotesMap["TRUCK175"] : undefined);

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={isRecalculating}
                      onClick={() => handleSwitchVehicle(v.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                        isSelected
                          ? "border-orange-500 bg-orange-50/90 text-orange-700 shadow-sm ring-2 ring-orange-400/30"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      } disabled:opacity-50`}
                    >
                      <div
                        className={`mb-1 flex h-7 w-7 items-center justify-center rounded-lg ${
                          isSelected
                            ? "bg-orange-500 text-white"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {v.icon === "bike" && <Bike className="h-4 w-4" />}
                        {v.icon === "van" && <Truck className="h-4 w-4" />}
                        {v.icon === "car" && <Car className="h-4 w-4" />}
                        {v.icon === "truck" && <Truck className="h-4 w-4" />}
                      </div>
                      <span className="text-xs font-bold">{v.name}</span>
                      <span className="mt-0.5 text-[10px] text-gray-400">
                        {v.desc.split("(")[1]?.replace(")", "") || v.desc}
                      </span>
                      {quoteForVehicle && (
                        <span className="mt-1 font-ddin text-[11px] font-extrabold text-orange-600">
                          NT$ {quoteForVehicle.priceBreakdown?.total || 0}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. 運費摘要卡片 (Order Summary Pill - Shared Component) */}
            <QuotationSummaryCard
              variant="pill"
              quotation={currentQuotation}
              locale={locale}
              vehicleName={
                VEHICLE_OPTIONS.find(
                  (v) => v.id === currentQuotation.serviceType,
                )?.name ||
                currentQuotation.serviceName ||
                currentQuotation.serviceType
              }
              postTitle={post.title}
              originAddress={originAddr}
              destinationAddress={destAddr}
              onExpireChange={handleExpireChange}
              onRecalculate={() => handleBatchRecalculate()}
              isRecalculating={isRecalculating}
              showSmallRecalculateButton={true}
              showBreakdownToggle={true}
            />

            {/* 5. 錯誤訊息與送出 / 取消按鈕 */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-2.5 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Lalamove 官方即時媒合保障</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>

                {isQuoteExpired ? (
                  <button
                    type="button"
                    onClick={() => handleBatchRecalculate()}
                    disabled={isRecalculating}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:from-amber-600 hover:to-orange-600 active:scale-[0.99] disabled:opacity-50"
                  >
                    <RotateCw
                      className={`h-3.5 w-3.5 ${isRecalculating ? "animate-spin" : ""}`}
                    />
                    {isRecalculating
                      ? "重新計算中..."
                      : locale === "en"
                        ? "Quote Expired · Recalculate"
                        : "報價已過期 · 點此重新試算"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || isEditingAddresses}
                    className="flex items-center gap-1.5 rounded-xl bg-green-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-green-600/25 transition-all hover:bg-green-700 active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RotateCw className="h-3.5 w-3.5 animate-spin" />
                        {locale === "en"
                          ? "Connecting to payment..."
                          : "正在建立安全交易通道..."}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {locale === "en"
                          ? `Pay Securely (NT$ ${currentQuotation.priceBreakdown.total})`
                          : `前往安全付款 (NT$ ${currentQuotation.priceBreakdown.total})`}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default OrderPlacementModal;

