import * as Sentry from "@sentry/nextjs";

export interface ProcessedImage {
  blob: Blob | File;
  filename: string;
  isCompressed: boolean;
}

/**
 * Detects whether the browser's Canvas API can actually encode to WebP.
 * iOS Safari silently falls back to image/png when image/webp is requested,
 * so we must proactively check rather than trust the MIME type we passed.
 */
let _webpSupportCache: boolean | null = null;
function isWebPEncodingSupported(): boolean {
  if (_webpSupportCache !== null) return _webpSupportCache;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    _webpSupportCache = canvas
      .toDataURL("image/webp")
      .startsWith("data:image/webp");
  } catch {
    _webpSupportCache = false;
  }
  return _webpSupportCache;
}

/**
 * iOS Safari canvas pixel limit is 16,777,216 px (4096×4096).
 * High-resolution iPhone photos (12MP+) must be pre-scaled before canvas draw
 * or toBlob() returns null / produces a blank image.
 */
const IOS_CANVAS_MAX_PIXELS = 16_777_216;

function safeScale(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let w = width;
  let h = height;

  // Scale down proportionally if either dimension exceeds the limit
  const scaleW = w > maxWidth ? maxWidth / w : 1;
  const scaleH = h > maxHeight ? maxHeight / h : 1;
  const scale = Math.min(scaleW, scaleH);
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Additionally enforce iOS canvas pixel budget (16MP max)
  const totalPixels = w * h;
  if (totalPixels > IOS_CANVAS_MAX_PIXELS) {
    const pixelScale = Math.sqrt(IOS_CANVAS_MAX_PIXELS / totalPixels);
    w = Math.floor(w * pixelScale);
    h = Math.floor(h * pixelScale);
  }

  return { width: w, height: h };
}

/**
 * Internal helper to compress a image Blob/File with max dimensions & quality.
 * Implements a 5-second timeout and fallback mechanism to guarantee promise resolution.
 * Handles iOS Safari WebP-to-PNG silent downgrade by always requesting JPEG on iOS.
 */
async function compressSingleImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let isSettled = false;
    let objectUrl: string | null = null;

    const safeResolve = (result: Blob | null) => {
      if (!isSettled) {
        isSettled = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        resolve(result);
      }
    };

    // 5-second timeout safeguard: if image decoding hangs on mobile browser, resolve null to trigger raw fallback
    const timer = setTimeout(() => {
      console.warn(
        `[ImageProcessor] Compression timed out (5s) for ${file.name}, fallback to raw file`,
      );
      safeResolve(null);
    }, 5000);

    // Choose output MIME type: use JPEG on iOS since Safari silently turns WebP → PNG
    const webpSupported = isWebPEncodingSupported();
    const targetMime = webpSupported ? "image/webp" : "image/jpeg";

    const drawAndBlob = (
      source: HTMLImageElement | ImageBitmap,
      w: number,
      h: number,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        clearTimeout(timer);
        safeResolve(null);
        return;
      }
      ctx.drawImage(source, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          clearTimeout(timer);
          if (blob && blob.size > 0) {
            safeResolve(blob);
          } else {
            // toBlob returned null or empty (e.g. canvas too large on old iOS) — try JPEG as last resort
            canvas.toBlob(
              (jpegBlob) => safeResolve(jpegBlob),
              "image/jpeg",
              quality,
            );
          }
        },
        targetMime,
        quality,
      );
    };

    const processBitmapOrImg = async () => {
      // 1. Try modern native createImageBitmap API (faster, off-main-thread, avoids HTMLImageElement quirks)
      if (typeof window !== "undefined" && "createImageBitmap" in window) {
        try {
          const bitmap = await createImageBitmap(file);
          const { width, height } = safeScale(
            bitmap.width,
            bitmap.height,
            maxWidth,
            maxHeight,
          );
          drawAndBlob(bitmap, width, height);
          bitmap.close();
          return;
        } catch (bitmapErr) {
          console.warn(
            `[ImageProcessor] createImageBitmap failed for ${file.name}, falling back to HTMLImageElement`,
            bitmapErr,
          );
        }
      }

      // 2. Fallback to HTMLImageElement loading
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {
        clearTimeout(timer);
        safeResolve(null);
        return;
      }

      const img = new Image();
      img.src = objectUrl;

      img.onload = () => {
        try {
          const { width, height } = safeScale(
            img.width,
            img.height,
            maxWidth,
            maxHeight,
          );
          drawAndBlob(img, width, height);
        } catch (err) {
          console.warn(
            `[ImageProcessor] Canvas drawing error for ${file.name}:`,
            err,
          );
          clearTimeout(timer);
          safeResolve(null);
        }
      };

      img.onerror = (err) => {
        console.warn(
          `[ImageProcessor] Image element loading error for ${file.name}:`,
          err,
        );
        clearTimeout(timer);
        safeResolve(null);
      };
    };

    processBitmapOrImg().catch((err) => {
      console.warn(
        `[ImageProcessor] Unexpected error compressing ${file.name}:`,
        err,
      );
      clearTimeout(timer);
      safeResolve(null);
    });
  });
}

/**
 * Safely compresses a single image with error handling, timeout protection, Sentry logging, and proper filename resolution.
 */
export async function safeCompressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
): Promise<ProcessedImage> {
  try {
    const compressedBlob = await compressSingleImage(
      file,
      maxWidth,
      maxHeight,
      quality,
    );

    if (compressedBlob) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      let ext: string;
      if (compressedBlob.type === "image/jpeg") {
        ext = "jpg";
      } else if (compressedBlob.type === "image/webp") {
        ext = "webp";
      } else {
        // PNG or unknown (e.g. unexpected Safari fallback) — still accept but log it
        ext = "jpg";
        const unexpectedMsg = `[ImageProcessor] Unexpected blob type ${compressedBlob.type} for ${file.name}, re-encoding as JPEG`;
        console.warn(unexpectedMsg);
        Sentry.captureMessage(unexpectedMsg, {
          level: "warning",
          tags: { feature: "image_compression", file_type: file.type },
          extra: { blobType: compressedBlob.type, fileName: file.name },
        });
      }
      return {
        blob: compressedBlob,
        filename: `${baseName}.${ext}`,
        isCompressed: true,
      };
    }

    // 當前端壓縮失敗 (compressedBlob === null) 時，發送 Warning 給 Sentry 記錄
    const warnMessage = `[ImageProcessor] Client compression failed for ${file.name}, fallback to raw file`;
    console.warn(warnMessage);
    Sentry.captureMessage(warnMessage, {
      level: "warning",
      tags: {
        feature: "image_compression",
        file_type: file.type,
      },
      extra: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    });
  } catch (error) {
    console.warn(`[ImageProcessor] Error compressing ${file.name}:`, error);
    Sentry.captureException(error, {
      tags: { feature: "image_compression" },
      extra: { fileName: file.name, fileSize: file.size },
    });
  }

  return {
    blob: file,
    filename: file.name,
    isCompressed: false,
  };
}

/**
 * Compresses multiple images concurrently using Promise.all.
 */
export async function compressImagesParallel(
  files: File[],
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
): Promise<ProcessedImage[]> {
  if (!files || files.length === 0) return [];

  return Promise.all(
    files.map((file) => safeCompressImage(file, maxWidth, maxHeight, quality)),
  );
}
