import { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import dbPool from "../utils/db";
import { LocationInputData, LocationRecord } from "../types/location";

/**
 * 標準 SQL 欄位字串，確保所有 JOIN locations 的查詢欄位一致，
 * 避免散落在各 service 時漏查 route、zip_code 或 url。
 */
export const LOCATION_SELECT_FIELDS = `
  l.place_id,
  l.name AS location_name,
  l.url AS location_url,
  l.full_address,
  l.route,
  l.province,
  l.city,
  l.lat,
  l.lng,
  l.zip_code
`.replace(/\s+/g, " ").trim();

export class LocationService {
  /**
   * 根據 place_id 查找或建立地點。
   * 若地點已存在，智慧型以 COALESCE 補齊原本為 NULL 的欄位（name, url, province, city, route, zip_code）。
   * 若無 place_id，則嘗試以 (full_address, lat, lng) 查詢，或生成穩定的 manual:lat,lng 識別碼。
   */
  async findOrCreateLocation(
    connection: Pool | PoolConnection,
    data: LocationInputData,
  ): Promise<number> {
    const zipCode = data.zip_code || data.zip || null;
    const effectivePlaceId =
      data.place_id ||
      `manual:${Number(data.lat).toFixed(7)},${Number(data.lng).toFixed(7)}`;

    // 1. 先用 place_id 查詢
    const checkQuery = `
      SELECT id, name, url, province, city, route, zip_code, full_address
      FROM locations
      WHERE place_id = ?
    `;
    const [rows] = await connection.execute<RowDataPacket[]>(checkQuery, [
      effectivePlaceId,
    ]);

    if (rows && rows.length > 0) {
      const existing = rows[0];
      const needsUpdate =
        (!existing.name && data.name) ||
        (!existing.url && data.url) ||
        (!existing.province && data.province) ||
        (!existing.city && data.city) ||
        (!existing.route && data.route) ||
        (!existing.zip_code && zipCode);

      if (needsUpdate) {
        await connection.execute(
          `UPDATE locations SET
            name = COALESCE(name, ?),
            url = COALESCE(url, ?),
            province = COALESCE(province, ?),
            city = COALESCE(city, ?),
            route = COALESCE(route, ?),
            zip_code = COALESCE(zip_code, ?)
          WHERE id = ?`,
          [
            data.name || null,
            data.url || null,
            data.province || null,
            data.city || null,
            data.route || null,
            zipCode,
            existing.id,
          ],
        );
      }
      return existing.id as number;
    }

    // 2. 若傳入時沒有 place_id，嘗試依精確地址與經緯度查詢，避免重複建立
    if (!data.place_id) {
      const [addrRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM locations WHERE full_address = ? AND lat = ? AND lng = ?",
        [data.full_address, data.lat, data.lng],
      );
      if (addrRows && addrRows.length > 0) {
        return addrRows[0].id as number;
      }
    }

    // 3. 寫入新地點 (使用 ON DUPLICATE KEY UPDATE 防止並發重複插入)
    const insertQuery = `
      INSERT INTO locations (
        place_id, name, full_address, province, city,
        route, zip_code, lat, lng, url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = COALESCE(locations.name, VALUES(name)),
        url = COALESCE(locations.url, VALUES(url)),
        province = COALESCE(locations.province, VALUES(province)),
        city = COALESCE(locations.city, VALUES(city)),
        route = COALESCE(locations.route, VALUES(route)),
        zip_code = COALESCE(locations.zip_code, VALUES(zip_code))
    `;

    const [result] = await connection.execute<ResultSetHeader>(insertQuery, [
      effectivePlaceId,
      data.name || null,
      data.full_address,
      data.province || null,
      data.city || null,
      data.route || null,
      zipCode,
      data.lat,
      data.lng,
      data.url || null,
    ]);

    if (result.insertId) {
      return result.insertId;
    }

    // 若為 DUPLICATE KEY 更新，取回已存在的 id
    const [finalRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM locations WHERE place_id = ?",
      [effectivePlaceId],
    );
    return finalRows[0].id as number;
  }

  /**
   * 根據 ID 取得地點資料
   */
  async getLocationById(
    id: number,
    connection: Pool | PoolConnection = dbPool,
  ): Promise<LocationRecord | null> {
    const query = `
      SELECT id, place_id, name, full_address, province, city, route, zip_code, lat, lng, url, created_at
      FROM locations
      WHERE id = ?
    `;
    const [rows] = await connection.execute<RowDataPacket[]>(query, [id]);
    if (!rows || rows.length === 0) return null;
    return rows[0] as LocationRecord;
  }

  /**
   * 建構地點關鍵字模糊搜尋 WHERE 條件片段
   * 包含 name, route, full_address, city, province 與 zip_code
   */
  buildLocationSearchCondition(keyword: string): {
    sql: string;
    params: string[];
  } {
    const term = `%${keyword}%`;
    return {
      sql: "(l.name LIKE ? OR l.route LIKE ? OR l.full_address LIKE ? OR l.city LIKE ? OR l.province LIKE ? OR l.zip_code LIKE ?)",
      params: [term, term, term, term, term, term],
    };
  }
}

export const locationService = new LocationService();
