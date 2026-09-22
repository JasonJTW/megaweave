// server/src/benchmark/queue/sampleImage.ts
// 合成的手機照片替身：固定尺寸與 seed 的漸層加雜訊 JPEG，讓 image worker 執行與真實上傳相同的
// sharp 解碼、縮圖與 WebP 壓縮工作；不使用任何真實照片。

import { createHash } from "crypto";
import sharp from "sharp";
import { createRandom } from "../fixture/random";

export interface SampleImage {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export async function createSampleImage(options: { width: number; height: number; seed: number }): Promise<SampleImage> {
  const { width, height } = options;
  const random = createRandom(options.seed);
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      // 平滑漸層模擬照片主體，雜訊讓 JPEG 壓縮量接近真實照片而非純色圖
      const noise = (random.next() - 0.5) * 48;
      pixels[offset] = Math.max(0, Math.min(255, (x / width) * 200 + 30 + noise));
      pixels[offset + 1] = Math.max(0, Math.min(255, (y / height) * 180 + 40 + noise));
      pixels[offset + 2] = Math.max(0, Math.min(255, ((x + y) / (width + height)) * 160 + 60 + noise));
    }
  }
  const buffer = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  return { buffer, width, height, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
}
