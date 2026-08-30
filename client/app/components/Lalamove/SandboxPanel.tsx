"use client";

import { useState } from "react";
import { FlaskConical, MapPin, Package, CheckCheck, RotateCw } from "lucide-react";
import toast from "react-hot-toast";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME || "";

const PRESET_LOCATIONS = [
  { label: "台北車站", lat: "25.047800", lng: "121.517000" },
  { label: "大直 (取件點)", lat: "25.083100", lng: "121.545200" },
  { label: "中和 (送達點)", lat: "24.992400", lng: "121.520300" },
  { label: "信義區", lat: "25.033000", lng: "121.565400" },
  { label: "松山機場", lat: "25.063100", lng: "121.552900" },
];

interface SandboxPanelProps {
  orderId: string;
  onAction: (optimisticUpdate?: {
    status?: string;
    driverCoords?: { lat: string | number; lng: string | number };
  }) => void;
}

export default function SandboxPanel({ orderId, onAction }: SandboxPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [customLat, setCustomLat] = useState("25.083100");
  const [customLng, setCustomLng] = useState("121.545200");

  const sandboxCall = async (
    endpoint: string,
    body: Record<string, string>,
    label: string,
    optimistic?: {
      status?: string;
      driverCoords?: { lat: string; lng: string };
    },
  ) => {
    setLoading(label);
    try {
      if (optimistic) {
        onAction(optimistic);
      }
      const res = await fetch(`${hostName}/api/lalamove/sandbox/${endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Sandbox error");
      toast.success(`✅ ${label} 成功！地圖已即時更新`);
      // 稍後再與伺服器完全同步
      setTimeout(() => onAction(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失敗";
      toast.error(`❌ ${label}: ${msg}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mx-auto mt-4 max-w-5xl px-3 sm:px-6">
      <div className="rounded-3xl border border-dashed border-violet-300 bg-violet-50/60 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500 text-white">
            <FlaskConical className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-violet-700">🧪 Sandbox 測試面板</span>
          <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-500">
            DEV ONLY
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <MapPin className="h-3.5 w-3.5 text-violet-500" />
              更新司機位置
            </p>
            <div className="mb-2 flex flex-wrap gap-1">
              {PRESET_LOCATIONS.map((loc) => (
                <button
                  key={loc.label}
                  type="button"
                  onClick={() => { setCustomLat(loc.lat); setCustomLng(loc.lng); }}
                  className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 hover:bg-violet-100"
                >
                  {loc.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex gap-1.5">
              <input type="text" value={customLat} onChange={(e) => setCustomLat(e.target.value)} placeholder="lat" className="w-full rounded-xl border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
              <input type="text" value={customLng} onChange={(e) => setCustomLng(e.target.value)} placeholder="lng" className="w-full rounded-xl border border-gray-200 px-2 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
            </div>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() =>
                sandboxCall(
                  "driver-location",
                  { lat: customLat, lng: customLng },
                  "更新司機位置",
                  { driverCoords: { lat: customLat, lng: customLng } },
                )
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-600 disabled:opacity-50"
            >
              {loading === "更新司機位置" ? <RotateCw className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
              套用座標 (即時移動司機)
            </button>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700">
              <Package className="h-3.5 w-3.5 text-violet-500" />
              模擬配送流程
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={loading !== null}
                onClick={() =>
                  sandboxCall("pickup", {}, "司機已取件", {
                    status: "PICKED_UP",
                  })
                }
                className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {loading === "司機已取件" ? <RotateCw className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
                📦 模擬司機取件 (PICKED_UP)
              </button>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() =>
                  sandboxCall("deliver", {}, "送達完成", {
                    status: "COMPLETED",
                  })
                }
                className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {loading === "送達完成" ? <RotateCw className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                🏁 模擬送達完成 (COMPLETED)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
