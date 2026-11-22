// services/imageUploadService.ts
import { api } from "@/lib/api";

export interface UploadableImage {
  blob: Blob | File;
  filename: string;
}

interface PresignedUrlResponse {
  urls: Array<{
    stagingKey: string;
    presignedUrl: string;
  }>;
}

/**
 * Uploads processed or raw images directly to S3 staging bucket via backend Presigned URLs.
 * Returns an array of S3 staging keys to be sent with the post creation/update payload.
 */
export async function uploadImagesToS3Staging(
  images: UploadableImage[],
): Promise<string[]> {
  if (!images || images.length === 0) {
    return [];
  }

  // 1. Request presigned upload URLs from backend
  const { urls } = await api<PresignedUrlResponse>(
    "/api/posts/presigned-urls",
    {
      method: "POST",
      body: {
        files: images.map((img) => ({
          filename: img.filename,
          contentType: img.blob.type || "image/jpeg",
        })),
      },
    },
  );

  if (!urls || urls.length !== images.length) {
    throw new Error("Mismatch in presigned URL response count");
  }

  // 2. Concurrently upload each image directly to S3 via HTTP PUT
  await Promise.all(
    urls.map(async ({ presignedUrl }, index) => {
      const { blob, filename } = images[index];
      const contentType = blob.type || "image/jpeg";

      // eslint-disable-next-line no-restricted-globals -- presigned PUT straight to S3, not our API
      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: blob,
      });

      if (!uploadRes.ok) {
        throw new Error(`Failed to upload ${filename} directly to storage`);
      }
    }),
  );

  // 3. Return staging keys
  return urls.map((u) => u.stagingKey);
}
