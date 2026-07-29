const CLOUDFRONT_CDN = process.env.NEXT_PUBLIC_CLOUDFRONT_CDN || "";

export type ImageSize = "thumb" | "medium" | "original";

/**
 * Given an S3 key (e.g. "posts/123-abc.jpg"), returns the complete CDN URL
 * for the specified size ("thumb" | "medium" | "original").
 */
export function getImageUrl(
  s3Key?: string | null,
  size: ImageSize = "original",
): string {
  if (!s3Key) return "";
  if (size === "original") return `${CLOUDFRONT_CDN}/${s3Key}`;

  const segments = s3Key.split("/");
  const category = segments[0];
  const rest = segments.slice(1);
  const filename = (rest.at(-1) ?? s3Key).replace(/\.[^.]+$/, ".webp");
  const subDirs = rest.slice(0, -1);

  const thumbKey = ["thumbnails", category, size, ...subDirs, filename].join(
    "/",
  );
  return `${CLOUDFRONT_CDN}/${thumbKey}`;
}

/**
 * Normalises post.s3_keys (string[] | comma-separated string | undefined)
 * into a plain string[]. Falls back to [] when absent.
 */
export function parseS3Keys(post: {
  s3_keys?: string[] | string;
}): string[] {
  const raw = post.s3_keys;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : raw.split(",").filter(Boolean);
}
