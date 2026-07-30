//* posts.ts

import { Request, Response, Router } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { handleError } from "./utils/errorHandler";

import { randomUUID } from "crypto";
import { z } from "zod";
import dotenv from "dotenv";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { memoryUpload, uploadToS3, insertImages, deleteS3Files } from "./upload";
import likeRouter from "./like";
import { shouldIncrementView } from "./utils/viewCounter";
import { getUserFromCookie } from "./session";
dotenv.config();

const router = Router();
const UPLOAD_IMAGE_LIMIT = process.env.UPLOAD_IMAGE_LIMIT || "5";

/// Post validation Schema
const ItemSchema = z.object({
  title: z.string().min(1, "Item title is required").max(20, "Title too long"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

const CreatePostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(2000, "Content too long"),
  status: z.enum(["active", "inactive", "expired"]).default("active"),
  place_id: z.string().optional(),
  full_address: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  route: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  type: z.enum(["wish", "share", "commons"]),
  tags: z.string().max(500).optional(),
  categoryId: z.number().int().positive("Invalid category ID"),
  conditionLevel: z.number().int().min(1).max(5, "Condition level must be 1-5"),
  expiresAt: z.string().datetime().optional(),
  items: z.array(ItemSchema).min(1, "At least one item is required").optional(),
});

type CreatePostSchemaType = z.infer<typeof CreatePostSchema>;

/// thumbnail generation
// function generateThumbnailUrl(originalUrl: string): string {
//   // 這裡可以實現縮圖邏輯，或使用 AWS Lambda/CloudFront 等服務
//   // 暫時返回原圖 URL，實際應用中建議實現縮圖功能
//   return originalUrl.replace(/(\.[^.]+)$/, '_thumb$1');
// }

// 驗證分類是否存在
async function validateCategory(categoryId: number): Promise<boolean> {
  const query = "SELECT id FROM categories WHERE id = ? AND status = 'active'";
  const [rows] = await dbPool.execute<RowDataPacket[]>(query, [categoryId]);
  return rows.length > 0;
}

// 查找或創建地點
async function findOrCreateLocation(
  connection: any,
  locationData: {
    place_id: string;
    full_address: string;
    province?: string;
    city?: string;
    route?: string;
    zip?: string;
    lat: number;
    lng: number;
  },
): Promise<number> {
  // 1. 檢查地點是否存在
  const checkQuery = "SELECT id FROM locations WHERE place_id = ?";
  const [rows] = await connection.execute(checkQuery, [locationData.place_id]);

  if ((rows as any[]).length > 0) {
    return (rows as any[])[0].id;
  }

  // 2. 插入新地點
  const insertQuery = `
    INSERT INTO locations (
      place_id, full_address, province, city, 
      route, zip_code, lat, lng
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await connection.execute(insertQuery, [
    locationData.place_id,
    locationData.full_address,
    locationData.province || null,
    locationData.city || null,
    locationData.route || null,
    locationData.zip || null,
    locationData.lat,
    locationData.lng,
  ]);

  return (result as any).insertId;
}

//* Create post API
router.post(
  "/",
  requireAuth,
  memoryUpload.array("images", parseInt(UPLOAD_IMAGE_LIMIT)),
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("API create post called");

    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];
    const items = req.body.items;
    console.log("Items: ", items);
    // if (!files || files.length === 0) {
    //   return res.status(400).json({ errorMessage: "No images uploaded" });
    // }
    // 1. 驗證輸入數據
    let validationResult: CreatePostSchemaType | undefined;
    try {
      const postData = {
        ...req.body,
        categoryId: parseInt(req.body.categoryId),
        conditionLevel: parseInt(req.body.conditionLevel),
        expiresAt: req.body.expires_at, // Map frontend expires_at to Zod schema expiresAt
        lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
        lng: req.body.lng ? parseFloat(req.body.lng) : undefined,
        items: items ? JSON.parse(items) : undefined,
      };

      console.log("Mapped postData expiresAt:", postData.expiresAt);

      validationResult = CreatePostSchema.parse(postData);
      console.log("Validation Result expiresAt:", validationResult.expiresAt);
    } catch (error) {
      console.error("Create post validation error: ", error);
      return handleError(error, res);
    }

    if (!validationResult) {
      return res.status(400).json({ error: "Invalid input" });
    }

    let connection;
    try {
      // 2. 驗證分類是否存在
      const categoryExists = await validateCategory(
        validationResult.categoryId,
      );
      if (!categoryExists) {
        return res.status(400).json({ errorMessage: "Invalid category" });
      }

      // 3. 開始數據庫事務
      //* Use connection to ensure atomicity
      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      // 4. 插入貼文記錄
      // 4. 處理地點
      let locationId = null;
      if (
        validationResult.place_id &&
        validationResult.full_address &&
        validationResult.lat !== undefined &&
        validationResult.lng !== undefined
      ) {
        locationId = await findOrCreateLocation(connection, {
          place_id: validationResult.place_id,
          full_address: validationResult.full_address,
          province: validationResult.province,
          city: validationResult.city,
          route: validationResult.route,
          zip: validationResult.zip,
          lat: validationResult.lat,
          lng: validationResult.lng,
        });
      }

      // 5. 插入貼文記錄
      const postInsertQuery = `
      INSERT INTO posts (
        user_id, title, content, status, type, location_id, tags, 
        category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
    `;

      const postValues = [
        userId,
        validationResult.title,
        validationResult.content,
        validationResult.status,
        validationResult.type,
        locationId,
        validationResult.tags || null,
        validationResult.categoryId,
        validationResult.conditionLevel,
        validationResult.expiresAt
          ? new Date(validationResult.expiresAt)
          : null,
      ];

      const [postResult] = await connection.execute<ResultSetHeader>(
        postInsertQuery,
        postValues,
      );
      const postId = postResult.insertId;

      // 4.5 Insert items if items exist
      if (validationResult.items && validationResult.items.length > 0) {
        const valuePlaceholders = validationResult.items
          .map(() => "(?, ?, ?, NOW(), NOW())")
          .join(", ");

        const bulkInsertItemQuery = `
    INSERT INTO items (post_id, title, quantity, created_at, updated_at) VALUES ${valuePlaceholders}
  `;

        const bulkValues: any[] = [];
        for (const item of validationResult.items) {
          bulkValues.push(postId, item.title, item.quantity);
        }
        await connection.execute(bulkInsertItemQuery, bulkValues);
      }

      // 5. Process and upload images
      const uploadedImages: Array<{
        url: string;
        thumbnailUrl: string;
        key: string;
        thumbKey: string;
      }> = [];

      if (files && files.length > 0) {
        const cloudfrontUrl = process.env.CLOUDFRONT_URL || "";
        for (const file of files) {
          const fileId = randomUUID();
          const timestamp = Date.now();
          const fileName = `${timestamp}-${fileId}.webp`;

          // Upload raw image to S3 (S3 Event triggers Lambda resizer asynchronously)
          const { key: mainKey, url: mainUrl } = await uploadToS3(
            file.buffer,
            "posts",
            fileName,
          );

          // Derived thumbnail path matching Lambda's folder structure (thumbnails/posts/thumb/{filename}.webp)
          const thumbKey = `thumbnails/posts/thumb/${fileName}`;
          const thumbUrl = `${cloudfrontUrl}/${thumbKey}`;

          uploadedImages.push({
            url: mainUrl,
            thumbnailUrl: thumbUrl,
            key: mainKey,
            thumbKey,
          });
        }
      }

      // 6. 提交事務
      if (uploadedImages.length > 0) {
        await insertImages(connection, postId, uploadedImages);
      }
      await connection.commit();

      // 7. 返回創建的貼文信息
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

      const [newPost] = await dbPool.execute<RowDataPacket[]>(getPostQuery, [
        postId,
      ]);

      res.status(201).json({
        message: "Post created successfully",
        post: newPost[0],
      });
    } catch (error) {
      // 回滾事務
      if (connection) {
        await connection.rollback();
      }

      // Note: We don't have 'uploadedImages' in scope here easily if processing fails mid-loop,
      // but we should ideally cleanup what WAS uploaded.
      // For simplicity in this refactor, we rely on the DB rollback.
      // In a production app, we'd track successfully uploaded keys for cleanup.

      console.error("⚠️Create post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },
);

// Get all posts api
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const category_id = req.query.category_id as string;
    const location = req.query.location as string;
    const city = req.query.city as string;
    const province = req.query.province as string;
    const status = (req.query.status as string) || "active";
    const search = req.query.search as string;
    const type = req.query.type as string;

    let whereConditions = ["p.status = ?", "p.deleted_at IS NULL"];
    let queryParams: any[] = [status];

    if (category_id) {
      whereConditions.push("c.id = ?");
      queryParams.push(parseInt(category_id));
    }

    // Optimize location search using indexes
    if (city || province) {
      if (city && province) {
        // Best case: Use composite index (province, city)
        whereConditions.push("l.province = ? AND l.city = ?");
        queryParams.push(province, city);
      } else if (province) {
        // Use index on province (first part of composite index)
        whereConditions.push("l.province = ?");
        queryParams.push(province);
      } else if (city) {
        // City only (might not fully use composite index but better than LIKE)
        whereConditions.push("l.city = ?");
        queryParams.push(city);
      }
    } else if (location) {
      // Fallback to legacy search (inefficient but needed for manual input)
      whereConditions.push(
        "(l.full_address LIKE ? OR l.city LIKE ? OR l.province LIKE ?)",
      );
      queryParams.push(`%${location}%`, `%${location}%`, `%${location}%`);
    }

    if (search) {
      whereConditions.push(
        "(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)",
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type) {
      whereConditions.push("p.type = ?");
      queryParams.push(type);
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

    // console.log("posts: ", posts);

    // 獲取總數
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

    res.status(200).json({
      posts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts: total,
        postsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get posts error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Get user's posts api
router.get("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

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
    // console.log("user's posts: ", userPosts)
    res.status(200).json({ userPosts });
  } catch (error) {
    console.error("Get user's posts error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Get post details api
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

    // 獲取貼文詳情
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
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    // 暫存貼文資料
    let postData = rows[0];

    // 2. 瀏覽計數邏輯處理
    try {
      // 嘗試獲取當前瀏覽者的 Session (檢查是否登入)
      const session = await getUserFromCookie(req);
      const currentUserId = session?.userId;
      console.log("viewCounter_userID: ", currentUserId);

      // 獲取 IP 作為未登入者的標識
      // 注意: 如果有經過 Nginx 或 Cloudflare，可能需要用 req.headers['x-forwarded-for']
      const ip = req.ip || req.headers["x-forwarded-for"] || "unknown_ip";

      // 決定識別碼：有登入用 ID，沒登入用 IP
      const viewerIdentifier = currentUserId
        ? `user:${currentUserId}`
        : `ip:${ip}`;
      const isAuthor = currentUserId && currentUserId === postData.user_id;

      // 條件：不是作者 且 通過 Redis 冷卻檢查
      if (!isAuthor) {
        const shouldCount = await shouldIncrementView(
          postId,
          viewerIdentifier as string,
        );

        if (shouldCount) {
          // 更新資料庫
          await dbPool.execute(
            "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
            [postId],
          );

          // 重要：手動更新記憶體中的 postData，讓回傳給前端的數據即時顯示 +1
          postData.view_count += 1;
        }
      }
    } catch (viewError) {
      // 瀏覽計數出錯不應影響貼文顯示，僅 log 錯誤
      console.error("View count logic failed:", viewError);
    }

    // 3. 獲取關聯資料 (圖片與 Items)
    const imagesQuery =
      "SELECT * FROM images WHERE post_id = ? ORDER BY created_at";
    const [images] = await dbPool.execute<RowDataPacket[]>(imagesQuery, [
      postId,
    ]);

    // 將圖片 S3 key 轉換為逗號分隔的字串格式
    const s3Keys = images
      .map((img: any) => img.s3_key)
      .filter(Boolean)
      .join(",");
    const [items] = await dbPool.execute(
      `SELECT * FROM items WHERE post_id = ?`,
      [postId],
    );
    const post = {
      ...rows[0],
      s3_keys: s3Keys,
      images,
      items,
    };

    console.log("post data: ", post);

    res.status(200).json({ post });
  } catch (error) {
    console.error("Get post error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Edit post API (PUT /:id)
// 直接沿用 CreatePostSchema，所有欄位改為 optional（Zod .partial()），
// 並額外加上編輯專用的 deleteImageIds 欄位。
const EditPostSchema = CreatePostSchema.partial().extend({
  expiresAt: z.string().datetime().optional().nullable(), // 允許傳 null 清除到期時間
  deleteImageIds: z.array(z.number().int().positive()).optional(), // 要刪除的圖片 ID 列表
});

type EditPostSchemaType = z.infer<typeof EditPostSchema>;

router.put(
  "/:id",
  requireAuth,
  memoryUpload.array("images", parseInt(UPLOAD_IMAGE_LIMIT)),
  async (req: AuthenticatedRequest, res: Response) => {
    const postId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];

    if (isNaN(postId)) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

    // 1. coerce multipart 字串 → 正確型別，再驗證
    let incoming: EditPostSchemaType;
    try {
      const raw = {
        ...req.body,
        ...(req.body.categoryId && {
          categoryId: parseInt(req.body.categoryId),
        }),
        ...(req.body.conditionLevel && {
          conditionLevel: parseInt(req.body.conditionLevel),
        }),
        ...(req.body.lat && { lat: parseFloat(req.body.lat) }),
        ...(req.body.lng && { lng: parseFloat(req.body.lng) }),
        ...(req.body.expiresAt === "" && { expiresAt: null }),
        ...(req.body.items && { items: JSON.parse(req.body.items) }),
        ...(req.body.deleteImageIds && {
          deleteImageIds: JSON.parse(req.body.deleteImageIds),
        }),
      };
      incoming = EditPostSchema.parse(raw);
    } catch (error) {
      console.error("Edit post validation error:", error);
      return handleError(error, res);
    }

    let connection: any;
    try {
      // 2. 撈現有資料（同時確認存在 & 所有權）
      const [rows] = await dbPool.execute<RowDataPacket[]>(
        "SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL",
        [postId],
      );
      if (rows.length === 0)
        return res.status(404).json({ errorMessage: "Post not found" });
      if (rows[0].user_id !== userId)
        return res.status(403).json({
          errorMessage: "Forbidden: You are not the owner of this post",
        });

      const existing = rows[0];

      // 3. 驗證分類（若有更新）
      if (incoming.categoryId !== undefined) {
        if (!(await validateCategory(incoming.categoryId))) {
          return res.status(400).json({ errorMessage: "Invalid category" });
        }
      }

      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      // 4. 處理地點更新
      let locationId = existing.location_id;
      if (
        incoming.place_id &&
        incoming.full_address &&
        incoming.lat !== undefined &&
        incoming.lng !== undefined
      ) {
        locationId = await findOrCreateLocation(connection, {
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

      // 5. Merge 現有資料 + 傳入資料，固定 UPDATE（和 Create Post 對稱）
      const merged = {
        title: incoming.title ?? existing.title,
        content: incoming.content ?? existing.content,
        status: incoming.status ?? existing.status,
        type: incoming.type ?? existing.type,
        tags: incoming.tags ?? existing.tags ?? null,
        categoryId: incoming.categoryId ?? existing.category_id,
        conditionLevel: incoming.conditionLevel ?? existing.condition_level,
        expiresAt:
          "expiresAt" in incoming
            ? incoming.expiresAt
              ? new Date(incoming.expiresAt)
              : null
            : existing.expires_at,
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

      // 6. 更新 Items（先清除舊的再重新插入）
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

      // 7. 刪除指定圖片
      if (incoming.deleteImageIds?.length) {
        const ph = incoming.deleteImageIds.map(() => "?").join(", ");
        const args = [...incoming.deleteImageIds, postId];
        const [imgRows] = (await connection.execute(
          `SELECT s3_key, thumbnail_s3_key FROM images WHERE id IN (${ph}) AND post_id = ?`,
          args,
        )) as [RowDataPacket[], any];

        await connection.execute(
          `DELETE FROM images WHERE id IN (${ph}) AND post_id = ?`,
          args,
        );

        const keysToDelete = imgRows.flatMap((img: any) =>
          [img.s3_key, img.thumbnail_s3_key].filter(Boolean),
        );
        if (keysToDelete.length > 0) await deleteS3Files(keysToDelete);
      }

      // 8. 上傳新圖片
      if (files && files.length > 0) {
        const cloudfrontUrl = process.env.CLOUDFRONT_URL || "";
        const uploadedImages: Array<{ url: string; thumbnailUrl: string; key: string }> = [];

        for (const file of files) {
          const fileId = randomUUID();
          const timestamp = Date.now();
          const fileName = `${timestamp}-${fileId}.webp`;

          const { key: mainKey, url: mainUrl } = await uploadToS3(
            file.buffer,
            "posts",
            fileName,
          );

          const thumbKey = `thumbnails/posts/thumb/${fileName}`;
          const thumbUrl = `${cloudfrontUrl}/${thumbKey}`;

          uploadedImages.push({ url: mainUrl, thumbnailUrl: thumbUrl, key: mainKey });
        }

        await insertImages(connection, postId, uploadedImages);
      }
      await connection.commit();

      const [updatedPost] = await dbPool.execute<RowDataPacket[]>(
        `SELECT p.*, u.username, u.public_id as author_public_id, u.id as author_user_id,
                u.avatar_url, c.name_en as category_name_en, cond.name as condition_name,
                l.place_id, l.full_address, l.province, l.city, l.lat, l.lng, l.route, l.zip_code,
                GROUP_CONCAT(i.s3_key ORDER BY i.id ASC) as s3_keys
         FROM posts p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN conditions cond ON p.condition_level = cond.level
         LEFT JOIN locations l ON p.location_id = l.id
         LEFT JOIN images i ON p.id = i.post_id
         WHERE p.id = ? GROUP BY p.id`,
        [postId],
      );

      res
        .status(200)
        .json({ message: "Post updated successfully", post: updatedPost[0] });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("⚠️ Edit post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    } finally {
      if (connection) connection.release();
    }
  },
);

//* Delete post api (Soft Delete)
router.delete(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id);
      const userId = req.user!.userId;

      if (isNaN(postId)) {
        return res.status(400).json({ errorMessage: "Invalid post ID" });
      }

      // Check ownership and if already deleted
      const checkQuery =
        "SELECT user_id FROM posts WHERE id = ? AND deleted_at IS NULL";
      const [rows] = await dbPool.execute<RowDataPacket[]>(checkQuery, [
        postId,
      ]);

      if (rows.length === 0) {
        return res.status(404).json({ errorMessage: "Post not found" });
      }

      const post = rows[0];
      if (post.user_id !== userId) {
        return res.status(403).json({
          errorMessage: "Forbidden: You are not the owner of this post",
        });
      }

      // Perform soft delete
      const deleteQuery = "UPDATE posts SET deleted_at = NOW() WHERE id = ?";
      await dbPool.execute(deleteQuery, [postId]);

      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error("Delete post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

/// like & unlike post api
router.use("/:id/like", likeRouter);

export default router;
