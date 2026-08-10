import * as Sentry from "@sentry/nextjs";

export interface ProcessedImage {
  blob: Blob | File;
  filename: string;
  isCompressed: boolean;
}

/**
 * Internal helper to compress a image Blob/File with max dimensions & quality.
 * Implements a 5-second timeout and fallback mechanism to guarantee promise resolution.
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

    const processBitmapOrImg = async () => {
      // 1. Try modern native createImageBitmap API (faster, background thread, no HTMLImageElement DOM overhead)
      if (typeof window !== "undefined" && "createImageBitmap" in window) {
        try {
          const bitmap = await createImageBitmap(file);
          let width = bitmap.width;
          let height = bitmap.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();

            canvas.toBlob(
              (blob) => {
                clearTimeout(timer);
                if (blob) {
                  safeResolve(blob);
                } else {
                  // Fallback to JPEG if WebP generation fails (legacy mobile WebViews)
                  canvas.toBlob(
                    (jpegBlob) => safeResolve(jpegBlob),
                    "image/jpeg",
                    quality,
                  );
                }
              },
              "image/webp",
              quality,
            );
            return;
          }
          bitmap.close();
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
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) {
            clearTimeout(timer);
            safeResolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              clearTimeout(timer);
              if (blob) {
                safeResolve(blob);
              } else {
                canvas.toBlob(
                  (jpegBlob) => safeResolve(jpegBlob),
                  "image/jpeg",
                  quality,
                );
              }
            },
            "image/webp",
            quality,
          );
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
      const ext = compressedBlob.type === "image/jpeg" ? "jpg" : "webp";
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
