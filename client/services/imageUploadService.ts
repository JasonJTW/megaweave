// services/imageUploadService.ts

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
  hostName: string = process.env.NEXT_PUBLIC_HOSTNAME || "",
): Promise<string[]> {
  if (!images || images.length === 0) {
    return [];
  }

  // 1. Request presigned upload URLs from backend
  const presignedRes = await fetch(`${hostName}/api/posts/presigned-urls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      files: images.map((img) => ({
        filename: img.filename,
        contentType: img.blob.type || "image/jpeg",
      })),
    }),
  });

  if (!presignedRes.ok) {
    const errorData = await presignedRes.json().catch(() => ({}));
    throw new Error(
      errorData.errorMessage || "Failed to obtain upload permissions",
    );
  }

  const { urls }: PresignedUrlResponse = await presignedRes.json();

  if (!urls || urls.length !== images.length) {
    throw new Error("Mismatch in presigned URL response count");
  }

  // 2. Concurrently upload each image directly to S3 via HTTP PUT
  await Promise.all(
    urls.map(async ({ presignedUrl }, index) => {
      const { blob, filename } = images[index];
      const contentType = blob.type || "image/jpeg";

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
