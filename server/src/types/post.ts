/**
 * types/post.ts
 *
 * 貼文相關的共用型別定義。
 * 所有 service / controller / utility 都應從此處 import，
 * 避免分散重複定義導致維護困難。
 */

/** 貼文類型 */
export type PostType = "share" | "wish" | "commons";

/** 貼文內附的物品 */
export interface PostItemData {
  title: string;
  quantity: number;
}

/** 向量文字組裝的共用基底欄位 */
interface PostTextBase {
  title: string;
  content: string;
  type: PostType;
  tags?: string | null;
  items?: PostItemData[];
  city?: string | null;
  province?: string | null;
}

/**
 * Queue Payload：傳入 BullMQ 的貼文向量化任務資料。
 * 只傳 ID，由 Worker 從記憶體快取解析分類與狀況名稱。
 */
export interface PostTextInput extends PostTextBase {
  categoryId: number;
  conditionLevel: number;
}

/**
 * generatePostText 的輸入結構。
 * 分類與狀況已由 Worker 解析為文字名稱（category_name / condition_name）。
 */
export interface PostTextRendered extends PostTextBase {
  category_name?: string;
  condition_name?: string;
}
/** 貼文圖片資料結構 */
export interface PostImage {
  id: number;
  post_id: number;
  s3_key: string;
  alt_text?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
  created_at: string | Date;
  updated_at?: string | Date | null;
}

/** 完整貼文詳情資料結構 (含作者、分類、地點、物品、圖片關聯) */
export interface PostDetail {
  id: number;
  user_id: number;
  title: string;
  content: string;
  location_id?: number | null;
  type: PostType;
  status: "active" | "inactive";
  tags?: string | null;
  category_id: number;
  condition_level: number;
  expires_at?: string | Date | null;
  view_count: number;
  likes_count: number;
  comment_count?: number;
  hot_score?: number;
  embedding?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at?: string | Date | null;
  // 關聯 User 欄位
  username?: string;
  author_public_id?: string;
  author_user_id?: number;
  email?: string;
  avatar_url?: string | null;
  // 關聯 Category / Condition 欄位
  category_name_en?: string;
  condition_name?: string;
  // 關聯 Location 欄位
  place_id?: string | null;
  location_name?: string | null;
  location_url?: string | null;
  full_address?: string | null;
  province?: string | null;
  city?: string | null;
  route?: string | null;
  zip_code?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
  // 附加結構
  s3_keys?: string;
  images?: PostImage[];
  items?: PostItemData[];
}
