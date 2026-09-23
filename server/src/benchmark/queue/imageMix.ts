// server/src/benchmark/queue/imageMix.ts
// Queue burst 上傳的原圖組成：client 會先把照片壓到 1200px（支援 WebP 編碼的瀏覽器輸出 WebP，iOS Safari 輸出 JPEG），
// 壓縮失敗或逾時才上傳原圖。worker 對已是 ≤1200px 的 WebP 只讀 metadata，其餘才做 resize + WebP 編碼，
// 所以原圖組成直接決定 image worker 的 CPU 成本。

import { createRandom, deriveSeed } from "../fixture/random";

export interface SourceImageVariant {
  name: string;
  format: "jpeg" | "webp";
  width: number;
  height: number;
  /** 相對權重 */
  weight: number;
  description: string;
}

const CLIENT_WEBP: Omit<SourceImageVariant, "weight"> = {
  name: "client-webp",
  format: "webp",
  width: 1200,
  height: 900,
  description: "compressed in the browser to WebP ≤1200px; the worker skips re-encoding",
};
const CLIENT_JPEG: Omit<SourceImageVariant, "weight"> = {
  name: "client-jpeg",
  format: "jpeg",
  width: 1200,
  height: 900,
  description: "compressed in a browser without WebP canvas encoding (iOS Safari) to JPEG ≤1200px; the worker re-encodes to WebP",
};
const RAW_PHOTO: Omit<SourceImageVariant, "weight"> = {
  name: "raw",
  format: "jpeg",
  width: 2048,
  height: 1536,
  description: "client compression failed or timed out and the original photo was uploaded; the worker resizes and re-encodes",
};

/**
 * 預估的一般組成；尚無 production 上傳格式統計，比例是假設值，會隨 artifact 記錄。
 * 取得真實比例後（例如 Sentry 的 client 壓縮失敗率與裝置分佈）應更新此處。
 */
export const TYPICAL_IMAGE_MIX: readonly SourceImageVariant[] = [
  { ...CLIENT_WEBP, weight: 50 },
  { ...CLIENT_JPEG, weight: 30 },
  { ...RAW_PHOTO, weight: 20 },
];

/** 壓力測試：所有上傳都是未壓縮原圖，image worker 的最壞情況 */
export const RAW_IMAGE_MIX: readonly SourceImageVariant[] = [{ ...RAW_PHOTO, weight: 100 }];

/** 依 seed 為每張圖指派原圖類型；相同 seed 與數量永遠得到相同結果 */
export function assignImageVariants(options: {
  seed: number;
  count: number;
  mix: readonly SourceImageVariant[];
}): SourceImageVariant[] {
  const random = createRandom(deriveSeed(options.seed, "image-mix"));
  const entries = options.mix.map((variant) => [variant, variant.weight] as const);
  return Array.from({ length: options.count }, () => random.weighted(entries));
}

export function countVariants(variants: readonly SourceImageVariant[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const variant of variants) counts[variant.name] = (counts[variant.name] ?? 0) + 1;
  return counts;
}
