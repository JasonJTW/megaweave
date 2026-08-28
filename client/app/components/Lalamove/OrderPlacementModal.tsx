"use client";

import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";

export interface QuotationItem {
  quotationId: string;
  serviceType: string;
  serviceName?: string;
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
  post: Post;
  originAddress: string;
  destinationAddress: string;
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

export const OrderPlacementModal: React.FC<OrderPlacementModalProps> = ({
  isOpen,
  onClose,
  quotation: initialQuotation,
  post,
  originAddress: initialOriginAddress,
  destinationAddress: initialDestinationAddress,
  currentUser,
  locale = "zh",
}) => {
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

  const [currentQuotation, setCurrentQuotation] =
    useState<QuotationItem | null>(initialQuotation);

  // 地址狀態
  const [originAddr, setOriginAddr] = useState(initialOriginAddress);
  const [destAddr, setDestAddr] = useState(initialDestinationAddress);
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

  // 同步 props 變更
  useEffect(() => {
    setCurrentQuotation(initialQuotation);
    setOriginAddr(initialOriginAddress);
    setDestAddr(initialDestinationAddress);
  }, [initialQuotation, initialOriginAddress, initialDestinationAddress]);

  // Google Places Autocomplete 綁定
  useEffect(() => {
    if (!isOpen || !isEditingAddresses || typeof window === "undefined") return;
    if (!window.google?.maps?.places) return;

    if (originInputRef.current) {
      const autoOrigin = new window.google.maps.places.Autocomplete(
        originInputRef.current,
        {
          componentRestrictions: { country: "tw" },
          fields: ["formatted_address", "name", "geometry"],
        },
      );
      autoOrigin.addListener("place_changed", () => {
        const place = autoOrigin.getPlace();
        if (place.formatted_address) {
          setOriginAddr(place.formatted_address);
        }
      });
    }

    if (destInputRef.current) {
      const autoDest = new window.google.maps.places.Autocomplete(
        destInputRef.current,
        {
          componentRestrictions: { country: "tw" },
          fields: ["formatted_address", "name", "geometry"],
        },
      );
      autoDest.addListener("place_changed", () => {
        const place = autoDest.getPlace();
        if (place.formatted_address) {
          setDestAddr(place.formatted_address);
        }
      });
    }
  }, [isOpen, isEditingAddresses]);

  // 重新試算運費
  const handleRecalculate = async () => {
    if (!originAddr.trim() || !destAddr.trim()) {
      setErrorMessage("取件與送達地址皆不能為空");
      return;
    }

    try {
      setIsRecalculating(true);
      setErrorMessage("");

      const serviceType = currentQuotation?.serviceType || "MOTORCYCLE";
      const stops = [
        {
          coordinates: {
            lat: post.lat || 25.033,
            lng: post.lng || 121.5654,
          },
          address: sanitizeTwAddress(originAddr),
        },
        {
          coordinates: {
            lat: (post.lat || 25.033) + 0.02,
            lng: (post.lng || 121.5654) + 0.02,
          },
          address: sanitizeTwAddress(destAddr),
        },
      ];

      const res = await fetch(`${hostName}/api/lalamove/quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType,
          stops,
          language: locale === "en" ? "en_TW" : "zh_TW",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.primary) {
        throw new Error(data.message || data.error || "地址重新計算報價失敗");
      }

      setCurrentQuotation(data.primary);
      setIsEditingAddresses(false);
      toast.success("運費與路線已依新地址重新計算！");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "重新計算報價失敗";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsRecalculating(false);
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

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!currentQuotation) {
      setErrorMessage("請先取得有效報價");
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
        locale === "en" ? "Recipient phone is required" : "請填寫收件人手機電話",
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

      const senderStopId = currentQuotation.stops?.[0]?.id || "";
      const recipientStopId = currentQuotation.stops?.[1]?.id || "";

      const orderPayload = {
        quotationId: currentQuotation.quotationId,
        sender: {
          stopId: senderStopId,
          name: senderName.trim(),
          phone: formatPhone(senderPhone),
          remarks: senderFullRemarks,
        },
        recipients: [
          {
            stopId: recipientStopId,
            name: recipientName.trim(),
            phone: formatPhone(recipientPhone),
            remarks: recipientFullRemarks,
          },
        ],
        metadata: {
          postId: post.id,
          postTitle: post.title,
        },
      };

      const response = await fetch(`${hostName}/api/lalamove/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || "建立訂單失敗");
      }

      toast.success(
        locale === "en"
          ? "Lalamove order placed successfully!"
          : "Lalamove 訂單建立成功，正在為您媒合司機！",
      );
      onClose();

      const orderId = data.order.orderId;
      router.push(`/delivery/${orderId}`);
    } catch (err: unknown) {
      console.error("Create order failed:", err);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[201] max-h-[92vh] w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl focus:outline-none sm:p-6">
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
                    ? "Confirm details, edit addresses or add remarks."
                    : "可在此修改地址、樓層門牌與聯絡人資訊。"}
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

          {/* Order Summary Pill */}
          <div className="my-2.5 rounded-2xl border border-orange-200/80 bg-orange-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-orange-800">
                  {currentQuotation.serviceName || currentQuotation.serviceType}{" "}
                  配送
                </span>
                <p className="mt-0.5 text-xs text-gray-600 line-clamp-1">
                  物品：{post.title}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">預估運費</span>
                <div className="font-ddin text-xl font-bold text-orange-600">
                  NT$ {currentQuotation.priceBreakdown.total}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitOrder} className="space-y-4">
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
                <div className="mb-3 space-y-2 rounded-xl bg-orange-50/50 p-2.5 border border-orange-200/60">
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
                <p className="mb-3 text-xs text-gray-600 bg-gray-50 p-2 rounded-xl">
                  <span className="font-semibold text-gray-700">
                    取件地址：
                  </span>
                  {originAddr}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    取件樓層 / 門牌 (選填)
                  </label>
                  <input
                    type="text"
                    value={senderFloorUnit}
                    onChange={(e) => setSenderFloorUnit(e.target.value)}
                    placeholder="例：3樓之1、A棟"
                    className="w-full rounded-xl border border-gray-200 py-1.5 px-3 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                <div className="mb-3 space-y-2 rounded-xl bg-orange-50/50 p-2.5 border border-orange-200/60">
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
                <p className="mb-3 text-xs text-gray-600 bg-gray-50 p-2 rounded-xl">
                  <span className="font-semibold text-gray-700">
                    送達地址：
                  </span>
                  {destAddr}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    送達樓層 / 門牌 (選填)
                  </label>
                  <input
                    type="text"
                    value={recipientFloorUnit}
                    onChange={(e) => setRecipientFloorUnit(e.target.value)}
                    placeholder="例：5樓之2、管理室"
                    className="w-full rounded-xl border border-gray-200 py-1.5 px-3 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
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
                  onClick={handleRecalculate}
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

                <button
                  type="submit"
                  disabled={isSubmitting || isEditingAddresses}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-orange-600 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      正在建立訂單...
                    </>
                  ) : (
                    <>
                      確認叫車 (NT$ {currentQuotation.priceBreakdown.total})
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default OrderPlacementModal;
