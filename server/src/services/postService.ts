// server/src/services/postService.ts
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { randomUUID } from "crypto";
import dbPool from "../utils/db";
import { shouldIncrementView } from "../utils/viewCounter";
import {
  enqueuePostUploadImages,
  enqueuePostDeleteImages,
  enqueuePostEmbedding,
} from "../queue/queues";
import {
  PostType,
  PostItemData,
  PostTextInput,
  PostTextRendered,
  PostDetail,
  PostImage,
} from "../types/post";
import { generatePostText } from "../utils/generatePostText";
import { fetchEmbedding } from "../queue/jobs/postEmbedding";
import { calculatePostHotScore } from "../queue/jobs/hotScore";
import { getRedisClient } from "../utils/redis";
import { LocationInputData } from "../types/location";
import { locationService } from "./locationService";
export type { PostType, PostItemData, PostTextInput, PostTextRendered, PostDetail, PostImage };
export type LocationData = LocationInputData;

export interface CreatePostInput {
  title: string;
  content: string;
  status: "active" | "inactive";
  type: PostType;
  categoryId: number;
  conditionLevel: number;
  tags?: string;
  expiresAt?: string;
  place_id?: string;
  location_name?: string;
  location_url?: string;
  full_address?: string;
  province?: string;
  city?: string;
  route?: string;
  zip?: string;
  zip_code?: string;
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
    return locationService.findOrCreateLocation(connection, locationData);
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
          name: input.location_name,
          url: input.location_url,
          full_address: input.full_address,
          province: input.province,
          city: input.city,
          route: input.route,
          zip_code: input.zip_code || input.zip,
          lat: input.lat,
          lng: input.lng,
        });
      }

      const publicId = randomUUID();
      const postInsertQuery = `
        INSERT INTO posts (
          public_id, user_id, title, content, status, type, location_id, tags, 
          category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
      `;

      const postValues = [
        publicId,
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

      // 非同步產生語義向量（不阻塞 HTTP response，由 Worker 自動補齊分類與狀況名稱）
      await enqueuePostEmbedding({
        postId,
        post: {
          title: input.title,
          content: input.content,
          type: input.type,
          categoryId: input.categoryId,
          conditionLevel: input.conditionLevel,
          tags: input.tags,
          items: input.items,
          city: input.city,
          province: input.province,
        },
      });

      // 🌟 即時將新貼文寫入 Redis feed:trending (熱門推薦榜) 與更新 hot_score
      const postStatus = input.status || "active";
      if (postStatus === "active") {
        try {
          const initialScore = calculatePostHotScore({
            status: "active",
            view_count: 0,
            likes_count: 0,
            comment_count: 0,
            weave_count: 0,
            created_at: new Date(),
          });

          if (initialScore > 0) {
            const redis = getRedisClient();
            await redis.zAdd("feed:trending", {
              score: initialScore,
              value: String(postId),
            });
            await dbPool.execute(
              "UPDATE posts SET hot_score = ? WHERE id = ?",
              [initialScore, postId],
            );
          }
        } catch (redisErr) {
          console.warn("⚠️ Failed to add new post to feed:trending:", redisErr);
        }
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
  /** 取得單一貼文詳情（對外 API，使用 public_id）與處理觀看計數 */
  async getPostByPublicId(
    publicId: string,
    options?: { currentUserId?: number; viewerIp?: string },
  ): Promise<PostDetail | null> {
    const postQuery = `
      SELECT 
        p.*,
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.email,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.province, l.city, l.lat, l.lng, l.route, l.zip_code
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE p.public_id = ? AND p.deleted_at IS NULL
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(postQuery, [publicId]);
    if (rows.length === 0) {
      return null;
    }

    return await this.hydratePostDetails(rows[0], options);
  }

  /** 內部使用：根據數字 ID 取得單一貼文詳情與處理觀看計數 */
  async getPostById(
    postId: number,
    options?: { currentUserId?: number; viewerIp?: string },
  ): Promise<PostDetail | null> {
    const postQuery = `
      SELECT 
        p.*,
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.email,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.province, l.city, l.lat, l.lng, l.route, l.zip_code
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(postQuery, [postId]);
    if (rows.length === 0) {
      return null;
    }

    return await this.hydratePostDetails(rows[0], options);
  }

  /** 輔助方法：將 public_id 解析為內部 post_id */
  async getPostIdByPublicId(publicId: string): Promise<number | null> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id FROM posts WHERE public_id = ? AND deleted_at IS NULL",
      [publicId],
    );
    return rows.length > 0 ? (rows[0].id as number) : null;
  }

  /** 內部組裝貼文詳細資料、圖片、物品與處理觀看計數 */
  private async hydratePostDetails(
    row: RowDataPacket,
    options?: { currentUserId?: number; viewerIp?: string },
  ): Promise<PostDetail> {
    const postData = { ...row };
    const postId = postData.id;

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

            if (currentUserId) {
              dbPool
                .execute(
                  "INSERT INTO post_views (user_id, post_id, viewed_at) VALUES (?, ?, NOW())",
                  [currentUserId, postId],
                )
                .catch((err) =>
                  console.error("Failed to insert post_views record:", err),
                );
            }
          }
        }
      } catch (viewError) {
        console.error("View count logic failed:", viewError);
      }
    }

    const imagesQuery =
      "SELECT * FROM images WHERE post_id = ? ORDER BY created_at";
    const [images] = await dbPool.execute<(RowDataPacket & PostImage)[]>(
      imagesQuery,
      [postId],
    );

    const s3Keys = images
      .map((img) => img.s3_key)
      .filter(Boolean)
      .join(",");
    const [items] = await dbPool.execute<(RowDataPacket & PostItemData)[]>(
      `SELECT * FROM items WHERE post_id = ?`,
      [postId],
    );

    return {
      ...postData,
      s3_keys: s3Keys,
      images,
      items,
    } as unknown as PostDetail;
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
      const condition = locationService.buildLocationSearchCondition(params.location);
      whereConditions.push(condition.sql);
      queryParams.push(...condition.params);
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
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY (p.expires_at IS NOT NULL AND p.expires_at < NOW()) ASC, p.id DESC
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
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
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

  /** 取得使用者瀏覽過的貼文紀錄 */
  async getViewedPosts(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    posts: RowDataPacket[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalPosts: number;
      postsPerPage: number;
    };
  }> {
    const offset = (page - 1) * limit;

    const [countRows] = await dbPool.execute<RowDataPacket[]>(
      `
      SELECT COUNT(DISTINCT pv.post_id) as total
      FROM post_views pv
      JOIN posts p ON pv.post_id = p.id
      WHERE pv.user_id = ? AND p.deleted_at IS NULL
      `,
      [userId],
    );
    const total = (countRows[0] as { total: number })?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const postsQuery = `
      SELECT 
        p.*,
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        u.public_id as author_public_id,
        u.id as author_user_id,
        u.avatar_url,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys,
        MAX(pv.viewed_at) as viewed_at
      FROM post_views pv
      JOIN posts p ON pv.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN conditions cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE pv.user_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY viewed_at DESC
      LIMIT ? OFFSET ?
    `;

    const [viewedPosts] = await dbPool.query<RowDataPacket[]>(postsQuery, [
      userId,
      Number(limit),
      Number(offset),
    ]);

    return {
      posts: viewedPosts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts: total,
        postsPerPage: limit,
      },
    };
  }

  /** 編輯貼文（使用 public_id） */
  async updatePost(
    publicId: string,
    userId: number,
    incoming: EditPostInput,
    files?: Express.Multer.File[],
    userRole?: string,
  ): Promise<RowDataPacket> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT * FROM posts WHERE public_id = ? AND deleted_at IS NULL",
      [publicId],
    );

    if (rows.length === 0) {
      throw new Error("POST_NOT_FOUND");
    }

    const existing = rows[0];
    const postId = existing.id;
    if (existing.user_id !== userId && userRole !== "admin") {
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
          name: incoming.location_name,
          url: incoming.location_url,
          full_address: incoming.full_address,
          province: incoming.province,
          city: incoming.city,
          route: incoming.route,
          zip_code: incoming.zip_code || incoming.zip,
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

  /** 刪除貼文 (Soft Delete，使用 public_id) */
  async deletePost(publicId: string, userId: number, userRole?: string): Promise<void> {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id, user_id FROM posts WHERE public_id = ? AND deleted_at IS NULL",
      [publicId],
    );

    if (rows.length === 0) {
      throw new Error("POST_NOT_FOUND");
    }

    if (rows[0].user_id !== userId && userRole !== "admin") {
      throw new Error("FORBIDDEN");
    }

    const postId = rows[0].id;
    await dbPool.execute("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [
      postId,
    ]);

    // 🌟 即時自 Redis 移除已刪除的貼文（避免 feed:trending 與向量檢索殘留）
    try {
      const redis = getRedisClient();
      await Promise.all([
        redis.zRem("feed:trending", String(postId)),
        redis.del(`post:${postId}`),
      ]);
    } catch (redisErr) {
      console.warn("⚠️ Failed to remove deleted post from Redis:", redisErr);
    }
  }

  /** 為指定貼文排入向量生成任務（Worker 自動從快取解析分類與狀況名稱） */
  async enqueueEmbeddingForPost(postId: number): Promise<PostDetail> {
    const post: PostDetail | null = await this.getPostById(postId);
    if (!post) {
      throw new Error("POST_NOT_FOUND");
    }

    await enqueuePostEmbedding({
      postId,
      post: {
        title: post.title,
        content: post.content,
        type: post.type,
        categoryId: post.category_id,
        conditionLevel: post.condition_level,
        tags: post.tags,
        items: post.items || [],
        city: post.city,
        province: post.province,
      },
    });

    return post;
  }

  /**
   * //*[手動/測試用] 同步為指定貼文生成向量並存入 Redis/MySQL
   * //*繞過背景佇列，直接同步呼叫 OpenAI 並回傳產生的文字與向量資料
   */
  async generatePostEmbeddingSync(postId: number) {
    const post: PostDetail | null = await this.getPostById(postId);
    if (!post) {
      throw new Error("POST_NOT_FOUND");
    }

    // 同步路徑直接使用 getPostById 的 JOIN 結果，不需要繞經 Worker 快取
    const embeddingPayload: PostTextRendered = {
      title: post.title,
      content: post.content,
      type: post.type,
      category_name: post.category_name_en ?? undefined,
      condition_name: post.condition_name ?? undefined,
      tags: post.tags,
      items: post.items || [],
      city: post.city,
      province: post.province,
    };

    const text = generatePostText(embeddingPayload);
    const {
      buffer: vectorBuffer,
      vector,
      dimensions,
      byteLength,
    } = await fetchEmbedding(text);

    // 寫入 Redis 向量索引
    const redis = getRedisClient();
    await redis.hSet(`post:${postId}`, {
      v: vectorBuffer,
      post_id: postId,
      status: post.type,
    });

    // 持久化到 MySQL
    const vectorJson = JSON.stringify(
      Array.from(new Float32Array(vectorBuffer.buffer)),
    );
    await dbPool.execute("UPDATE posts SET embedding = ? WHERE id = ?", [
      vectorJson,
      postId,
    ]);

    return {
      post,
      text,
      embedding: {
        dimensions,
        byteLength,
        vectorBufferBase64: vectorBuffer.toString("base64"),
        vectorBufferHex: vectorBuffer.toString("hex"),
        vectorSample: vector.slice(0, 10),
        vectorLength: vector.length,
      },
    };
  }

  private async getPostDetailsQuery(postId: number): Promise<RowDataPacket> {
    const getPostQuery = `
      SELECT 
        p.*,
        COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS username,
        c.name_en as category_name_en,
        cond.name as condition_name,
        l.place_id, l.name as location_name, l.url as location_url, l.full_address, l.route, l.province, l.city, l.lat, l.lng, l.zip_code,
        GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
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
