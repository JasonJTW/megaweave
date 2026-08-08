// server/src/services/postService.ts
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { randomUUID } from "crypto";
import dbPool from "../utils/db";
import { shouldIncrementView } from "../utils/viewCounter";
import {
  enqueuePostUploadImages,
  enqueuePostDeleteImages,
} from "../queue/queues";

export interface LocationData {
  place_id: string;
  full_address: string;
  province?: string;
  city?: string;
  route?: string;
  zip?: string;
  lat: number;
  lng: number;
}

export interface PostItemData {
  title: string;
  quantity: number;
}

export interface CreatePostInput {
  title: string;
  content: string;
  status: "active" | "inactive";
  type: "wish" | "share" | "commons";
  categoryId: number;
  conditionLevel: number;
  tags?: string;
  expiresAt?: string;
  place_id?: string;
  full_address?: string;
  province?: string;
  city?: string;
  route?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  items?: PostItemData[];
}

export interface EditPostInput extends Omit<
  Partial<CreatePostInput>,
  "expiresAt"
> {
  expiresAt?: string | null;
  deleteImageIds?: number[];
}

export interface ListPostsParams {
  page?: number;
  limit?: number;
  category_id?: string;
  location?: string;
  city?: string;
  province?: string;
  status?: string;
  search?: string;
  type?: string;
}

export class PostService {
  /** 驗證分類是否存在與 active */
  async validateCategory(categoryId: number): Promise<boolean> {
    const query =
      "SELECT id FROM categories WHERE id = ? AND status = 'active'";
    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [categoryId]);
    return rows.length > 0;
  }

  /** 查找或建立地點 */
  async findOrCreateLocation(
    connection: PoolConnection,
    locationData: LocationData,
  ): Promise<number> {
    const checkQuery = "SELECT id FROM locations WHERE place_id = ?";
    const [rows] = await connection.execute<RowDataPacket[]>(checkQuery, [
      locationData.place_id,
    ]);

    if (rows.length > 0) {
      return rows[0].id as number;
    }

    const insertQuery = `
      INSERT INTO locations (
        place_id, full_address, province, city, 
        route, zip_code, lat, lng
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.execute<ResultSetHeader>(insertQuery, [
      locationData.place_id,
      locationData.full_address,
      locationData.province || null,
      locationData.city || null,
      locationData.route || null,
      locationData.zip || null,
      locationData.lat,
      locationData.lng,
    ]);

    return result.insertId;
  }

  /** 建立貼文 */
  async createPost(
    userId: number,
    input: CreatePostInput,
    files?: Express.Multer.File[],
  ): Promise<RowDataPacket> {
    const categoryExists = await this.validateCategory(input.categoryId);
    if (!categoryExists) {
      throw new Error("INVALID_CATEGORY");
    }

    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();

      let locationId = null;
      if (
        input.place_id &&
        input.full_address &&
        input.lat !== undefined &&
        input.lng !== undefined
      ) {
        locationId = await this.findOrCreateLocation(connection, {
          place_id: input.place_id,
          full_address: input.full_address,
          province: input.province,
          city: input.city,
          route: input.route,
          zip: input.zip,
          lat: input.lat,
          lng: input.lng,
        });
      }

      const postInsertQuery = `
        INSERT INTO posts (
          user_id, title, content, status, type, location_id, tags, 
          category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
      `;

      const postValues = [
        userId,
        input.title,
        input.content,
        input.status,
        input.type,
        locationId,
        input.tags || null,
        input.categoryId,
        input.conditionLevel,
        input.expiresAt ? new Date(input.expiresAt) : null,
      ];

      const [postResult] = await connection.execute<ResultSetHeader>(
        postInsertQuery,
        postValues,
      );
      const postId = postResult.insertId;

      if (input.items && input.items.length > 0) {
        const placeholders = input.items
          .map(() => "(?, ?, ?, NOW(), NOW())")
          .join(", ");
        const bulkQuery = `INSERT INTO items (post_id, title, quantity, created_at, updated_at) VALUES ${placeholders}`;
        const bulkValues: (string | number)[] = [];
        for (const item of input.items) {
          bulkValues.push(postId, item.title, item.quantity);
        }
        await connection.execute(bulkQuery, bulkValues);
      }

      // 預先在 DB 事務中插入 s3_key，確保即時回傳 201 時 posts 資料表已有圖檔 key 關聯
      const fileJobs: Array<{ s3Key: string; tempPath: string }> = [];
      if (files && files.length > 0) {
        const dbImageValues: (number | string)[] = [];
        const placeholders = files.map(() => "(?, ?, ?, NOW())").join(", ");

        for (const file of files) {
          const fileId = randomUUID();
          const timestamp = Date.now();
          const fileName = `${timestamp}-${fileId}.webp`;
          const s3Key = `posts/${fileName}`;

          dbImageValues.push(postId, s3Key, `Image for post ${postId}`);
          fileJobs.push({
            s3Key,
            tempPath: file.path,
          });
        }

        await connection.execute(
          `INSERT INTO images (post_id, s3_key, alt_text, created_at) VALUES ${placeholders}`,
          dbImageValues,
        );
      }

      await connection.commit();

      // 將圖片傳輸非同步排入 BullMQ queue
      if (fileJobs.length > 0) {
        await enqueuePostUploadImages({
          postId,
          files: fileJobs,
        });
      }

      return await this.getPostDetailsQuery(postId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** 取得單一貼文詳情與處理觀看計數 */
  async getPostById(
    postId: number,
    options?: { currentUserId?: number; viewerIp?: string },
  ): Promise<RowDataPacket | null> {
    const postQuery = `
      SELECT 
        p.*,
        u.username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.email,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.full_address, l.province, l.city, l.lat, l.lng, l.route, l.zip_code
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(postQuery, [postId]);
    if (rows.length === 0) {
      return null;
    }

    const postData = { ...rows[0] };

    if (options) {
      try {
        const { currentUserId, viewerIp } = options;
        const viewerIdentifier = currentUserId
          ? `user:${currentUserId}`
          : `ip:${viewerIp || "unknown_ip"}`;
        const isAuthor = currentUserId && currentUserId === postData.user_id;

        if (!isAuthor) {
          const shouldCount = await shouldIncrementView(
            postId,
            viewerIdentifier,
          );
          if (shouldCount) {
            await dbPool.execute(
              "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
              [postId],
            );
            postData.view_count += 1;
          }
        }
      } catch (viewError) {
        console.error("View count logic failed:", viewError);
      }
    }

    const imagesQuery =
      "SELECT * FROM images WHERE post_id = ? ORDER BY created_at";
    const [images] = await dbPool.execute<RowDataPacket[]>(imagesQuery, [
      postId,
    ]);

    const s3Keys = images
      .map((img: RowDataPacket) => img.s3_key as string)
      .filter(Boolean)
      .join(",");
    const [items] = await dbPool.execute(
      `SELECT * FROM items WHERE post_id = ?`,
      [postId],
    );

    return {
      ...postData,
      s3_keys: s3Keys,
      images,
      items,
    };
  }

  /** 取得貼文列表 (分頁 & 搜尋) */
  async listPosts(params: ListPostsParams): Promise<{
    posts: RowDataPacket[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalPosts: number;
      postsPerPage: number;
    };
  }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;
    const status = params.status || "active";

    const whereConditions = ["p.status = ?", "p.deleted_at IS NULL"];
    const queryParams: (string | number)[] = [status];

    if (params.category_id) {
      whereConditions.push("c.id = ?");
      queryParams.push(parseInt(params.category_id));
    }

    if (params.city || params.province) {
      if (params.city && params.province) {
        whereConditions.push("l.province = ? AND l.city = ?");
        queryParams.push(params.province, params.city);
      } else if (params.province) {
        whereConditions.push("l.province = ?");
        queryParams.push(params.province);
      } else if (params.city) {
        whereConditions.push("l.city = ?");
        queryParams.push(params.city);
      }
    } else if (params.location) {
      whereConditions.push(
        "(l.full_address LIKE ? OR l.city LIKE ? OR l.province LIKE ?)",
      );
      queryParams.push(
        `%${params.location}%`,
        `%${params.location}%`,
        `%${params.location}%`,
      );
    }

    if (params.search) {
      whereConditions.push(
        "(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)",
      );
      queryParams.push(
        `%${params.search}%`,
        `%${params.search}%`,
        `%${params.search}%`,
      );
    }

    if (params.type) {
      whereConditions.push("p.type = ?");
      queryParams.push(params.type);
    }

    const whereClause = whereConditions.join(" AND ");

    const postsQuery = `
      SELECT 
        p.*,
        u.username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.full_address, l.route,l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY (p.expires_at IS NOT NULL AND p.expires_at < NOW()) ASC, p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [posts] = await dbPool.execute<RowDataPacket[]>(
      postsQuery,
      queryParams,
    );

    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE ${whereClause}
    `;

    const [countResult] = await dbPool.execute<RowDataPacket[]>(
      countQuery,
      queryParams,
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    return {
      posts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts: total,
        postsPerPage: limit,
      },
    };
  }

  /** 取得特地使用者的貼文 */
  async getUserPosts(userId: number): Promise<RowDataPacket[]> {
    const postsQuery = `
      SELECT 
        p.*,
        u.username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.full_address, l.route,l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE p.user_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const [userPosts] = await dbPool.execute<RowDataPacket[]>(postsQuery, [
      userId,
    ]);
    return userPosts;
  }

  /** 編輯貼文 */
  async updatePost(
    postId: number,
    userId: number,
    incoming: EditPostInput,
    files?: Express.Multer.File[],
  ): Promise<RowDataPacket> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL",
      [postId],
    );

    if (rows.length === 0) {
      throw new Error("POST_NOT_FOUND");
    }

    const existing = rows[0];
    if (existing.user_id !== userId) {
      throw new Error("FORBIDDEN");
    }

    if (incoming.categoryId !== undefined) {
      const categoryExists = await this.validateCategory(incoming.categoryId);
      if (!categoryExists) {
        throw new Error("INVALID_CATEGORY");
      }
    }

    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();

      let locationId = existing.location_id;
      if (
        incoming.place_id &&
        incoming.full_address &&
        incoming.lat !== undefined &&
        incoming.lng !== undefined
      ) {
        locationId = await this.findOrCreateLocation(connection, {
          place_id: incoming.place_id,
          full_address: incoming.full_address,
          province: incoming.province,
          city: incoming.city,
          route: incoming.route,
          zip: incoming.zip,
          lat: incoming.lat,
          lng: incoming.lng,
        });
      }

      const newExpiresAt =
        "expiresAt" in incoming
          ? incoming.expiresAt
            ? new Date(incoming.expiresAt)
            : null
          : existing.expires_at;

      const merged = {
        title: incoming.title ?? existing.title,
        content: incoming.content ?? existing.content,
        status: incoming.status ?? existing.status,
        type: incoming.type ?? existing.type,
        tags: incoming.tags ?? existing.tags ?? null,
        categoryId: incoming.categoryId ?? existing.category_id,
        conditionLevel: incoming.conditionLevel ?? existing.condition_level,
        expiresAt: newExpiresAt,
      };

      await connection.execute(
        `UPDATE posts
         SET title = ?, content = ?, status = ?, type = ?, tags = ?,
             category_id = ?, condition_level = ?, expires_at = ?,
             location_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          merged.title,
          merged.content,
          merged.status,
          merged.type,
          merged.tags,
          merged.categoryId,
          merged.conditionLevel,
          merged.expiresAt,
          locationId,
          postId,
        ],
      );

      if (incoming.items?.length) {
        await connection.execute("DELETE FROM items WHERE post_id = ?", [
          postId,
        ]);
        const placeholders = incoming.items
          .map(() => "(?, ?, ?, NOW(), NOW())")
          .join(", ");
        const values = incoming.items.flatMap((item) => [
          postId,
          item.title,
          item.quantity,
        ]);
        await connection.execute(
          `INSERT INTO items (post_id, title, quantity, created_at, updated_at) VALUES ${placeholders}`,
          values,
        );
      }

      // 刪除指定圖片（DB 刪除 + S3 清理解耦給 Queue）
      if (incoming.deleteImageIds?.length) {
        const ph = incoming.deleteImageIds.map(() => "?").join(", ");
        const args = [...incoming.deleteImageIds, postId];
        const [imgRows] = await connection.execute<RowDataPacket[]>(
          `SELECT s3_key FROM images WHERE id IN (${ph}) AND post_id = ?`,
          args,
        );

        await connection.execute(
          `DELETE FROM images WHERE id IN (${ph}) AND post_id = ?`,
          args,
        );

        const keysToDelete = imgRows
          .map((img: RowDataPacket) => img.s3_key as string)
          .filter(Boolean);

        if (keysToDelete.length > 0) {
          await enqueuePostDeleteImages({ s3Keys: keysToDelete });
        }
      }

      // 上傳新圖片：先在 DB 事務中預先插入 s3_key
      const fileJobs: Array<{ s3Key: string; tempPath: string }> = [];
      if (files && files.length > 0) {
        const dbImageValues: (number | string)[] = [];
        const placeholders = files.map(() => "(?, ?, ?, NOW())").join(", ");

        for (const file of files) {
          const fileId = randomUUID();
          const timestamp = Date.now();
          const fileName = `${timestamp}-${fileId}.webp`;
          const s3Key = `posts/${fileName}`;

          dbImageValues.push(postId, s3Key, `Image for post ${postId}`);
          fileJobs.push({
            s3Key,
            tempPath: file.path,
          });
        }

        await connection.execute(
          `INSERT INTO images (post_id, s3_key, alt_text, created_at) VALUES ${placeholders}`,
          dbImageValues,
        );
      }

      await connection.commit();

      // 排入 BullMQ queue 處理 S3 上傳
      if (fileJobs.length > 0) {
        await enqueuePostUploadImages({
          postId,
          files: fileJobs,
        });
      }

      return await this.getPostDetailsQuery(postId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** 刪除貼文 (Soft Delete) */
  async deletePost(postId: number, userId: number): Promise<void> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT user_id FROM posts WHERE id = ? AND deleted_at IS NULL",
      [postId],
    );

    if (rows.length === 0) {
      throw new Error("POST_NOT_FOUND");
    }

    if (rows[0].user_id !== userId) {
      throw new Error("FORBIDDEN");
    }

    await dbPool.execute("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [
      postId,
    ]);
  }

  private async getPostDetailsQuery(postId: number): Promise<RowDataPacket> {
    const getPostQuery = `
      SELECT 
        p.*,
        u.username,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.full_address, l.province, l.city, l.lat, l.lng,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE p.id = ?
      GROUP BY p.id
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(getPostQuery, [
      postId,
    ]);
    return rows[0];
  }
}

export const postService = new PostService();
