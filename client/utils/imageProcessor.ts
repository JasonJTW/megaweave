import * as Sentry from "@sentry/nextjs";

/**
 * Utility for compressing images on the client side using HTML5 Canvas and URL.createObjectURL.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(null);
      return;
    }

    const img = new Image();
    img.src = objectUrl;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
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

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first, then fallback to JPEG
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) {
              resolve(blob);
            } else {
              // Fallback to JPEG
              canvas.toBlob(
                (jpegBlob) => resolve(jpegBlob),
                "image/jpeg",
                quality,
              );
            }
          },
          "image/webp",
          quality,
        );
      } catch (error) {
        console.warn(
          "[ImageProcessor] Error during canvas compression:",
          error,
        );
        cleanup();
        resolve(null);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

export interface ProcessedImage {
  blob: Blob | File;
  filename: string;
  isCompressed: boolean;
}

/**
 * Safely compresses a single image with error handling and proper filename resolution.
 */
export async function safeCompressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
): Promise<ProcessedImage> {
  try {
    const compressedBlob = await compressImage(
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

    // 當壓縮失敗 (compressedBlob === null) 時，發送 Warning 給 Sentry 記錄
    Sentry.captureMessage(
      `[ImageProcessor] Client compression failed for ${file.name}, fallback to raw file`,
      {
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
      },
    );
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
