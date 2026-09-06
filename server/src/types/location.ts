/**
 * types/location.ts
 *
 * 地點 (locations) 相關的共用型別定義。
 * 統一後端 database schema 與 API input，避免散落在各 service 重複宣告。
 */

export interface LocationRecord {
  id: number;
  place_id: string;
  name: string | null;
  full_address: string;
  province: string | null;
  city: string | null;
  route: string | null;
  zip_code: string | null;
  lat: number;
  lng: number;
  url: string | null;
  created_at?: string | Date;
}

export interface LocationInputData {
  place_id?: string | null;
  name?: string | null;
  url?: string | null;
  full_address: string;
  province?: string | null;
  city?: string | null;
  route?: string | null;
  zip_code?: string | null;
  zip?: string | null; // 支援 zip 相容別名
  lat: number;
  lng: number;
}
