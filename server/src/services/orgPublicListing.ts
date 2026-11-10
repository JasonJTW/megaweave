//* 組織物品升到 Public 前要補齊的公開資訊（#140 後續；ADR 0003）
//* 組織物品上架時只有組織內需要的欄位：沒有地點、到期日與標籤，分類由組織類別推導。
//* 進公開 Feed 之前要像一般貼文一樣有地點（地圖、距離、地區篩選）、到期日與公開分類，標籤選填；
//* Org Admin 在送出待公開時一併填寫，同一個交易寫進 posts，正式公開前再檢查一次
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { locationService } from "./locationService";
import type { SqlExecutor } from "./postVisibility";

//* 欄位名稱與一般貼文的地點欄位相同（client 的 parseGooglePlace 產生），長度依 locations 欄位
const LocationSchema = z.object({
  place_id: z.string().trim().min(1).max(255),
  full_address: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().max(255).nullish(),
  url: z.string().max(500).nullish(),
  province: z.string().max(100).nullish(),
  city: z.string().max(100).nullish(),
  route: z.string().max(255).nullish(),
  zip_code: z.string().max(20).nullish(),
});

/** 使用者在公開確認框填的內容；驗證失敗走 VALIDATION_FAILED */
export const PublicListingSchema = z.object({
  categoryId: z.number().int().positive(),
  tags: z.string().trim().max(500).nullish(),
  expiresAt: z
    .string()
    .datetime()
    .refine((value) => Date.parse(value) > Date.now(), {
      message: "Expiry date must be in the future",
    }),
  location: LocationSchema,
});

export type PublicListingInput = z.infer<typeof PublicListingSchema>;

/** 公開確認框預填用：目前存在 posts 的公開資訊，沒填過的欄位為 null */
export interface PublicListing {
  categoryId: number | null;
  tags: string | null;
  expiresAt: string | null;
  location: {
    placeId: string;
    name: string | null;
    url: string | null;
    fullAddress: string;
    province: string | null;
    city: string | null;
    route: string | null;
    zipCode: string | null;
    lat: number;
    lng: number;
  } | null;
}

export function publicListingIncomplete() {
  return new HttpError(
    400,
    "ORG_PUBLIC_LISTING_INCOMPLETE",
    "Add a location, an expiry date and a category before making the item public",
  );
}

/** 公開前的檢查：有地點、有分類、到期日在未來 */
export function isPublicListingComplete(
  post: { locationId: number | null; expiresAt: Date | null; categoryId: number | null },
  now: Date,
): boolean {
  return (
    post.locationId !== null &&
    post.categoryId !== null &&
    post.expiresAt !== null &&
    post.expiresAt.getTime() > now.getTime()
  );
}

/** 在呼叫端的交易裡寫入公開資訊；分類不存在或已停用 → 400 INVALID_CATEGORY */
export async function savePublicListing(
  connection: PoolConnection,
  postId: number,
  input: PublicListingInput,
): Promise<void> {
  const [categories] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM categories WHERE id = ? AND status = 'active'",
    [input.categoryId],
  );
  if (categories.length === 0) {
    throw new HttpError(400, "INVALID_CATEGORY", "Invalid category");
  }
  const locationId = await locationService.findOrCreateLocation(connection, input.location);
  await connection.execute(
    "UPDATE posts SET category_id = ?, tags = ?, expires_at = ?, location_id = ? WHERE id = ?",
    [input.categoryId, input.tags || null, new Date(input.expiresAt), locationId, postId],
  );
}

export async function loadPublicListing(db: SqlExecutor, postId: number): Promise<PublicListing> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT p.category_id, p.tags, p.expires_at, l.place_id, l.name, l.url, l.full_address,
            l.province, l.city, l.route, l.zip_code, l.lat, l.lng
     FROM posts p LEFT JOIN locations l ON l.id = p.location_id
     WHERE p.id = ?`,
    [postId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
  return {
    categoryId: row.category_id == null ? null : Number(row.category_id),
    tags: row.tags ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    location: row.place_id
      ? {
          placeId: String(row.place_id),
          name: row.name ?? null,
          url: row.url ?? null,
          fullAddress: String(row.full_address),
          province: row.province ?? null,
          city: row.city ?? null,
          route: row.route ?? null,
          zipCode: row.zip_code ?? null,
          lat: Number(row.lat),
          lng: Number(row.lng),
        }
      : null,
  };
}
