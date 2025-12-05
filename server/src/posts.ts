//* posts.ts

import { Request, Response, Router } from "express";
import mysql, { ResultSetHeader, RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { handleError } from "./utils/errorHandler";
import { getRedisClient, connectRedis } from "./utils/redis";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import dotenv from "dotenv";
import { requireAuth, AuthenticatedRequest } from "./middleware/auth";
import { uploadImages, insertImages } from "./upload";
import { deleteS3Files } from "./upload";
import likeRouter from "./like";
dotenv.config();

const router = Router();
const redisClient = getRedisClient();
const COOKIE_SESSION_KEY = process.env.COOKIE_SESSION_KEY!;
const REDIS_SESSION_KEY = process.env.REDIS_SESSION_KEY!;
const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;
const UPLOAD_IMAGE_LIMIT = process.env.UPLOAD_IMAGE_LIMIT;

//* AWS S3 config
const s3Client = new S3Client({
  region: BUCKET_REGION,
  credentials: {
    accessKeyId: ACCESS_KEY!,
    secretAccessKey: SECRET_ACCESS_KEY!,
  },
});

//* Multer S3 config
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME!,
    key: function (req, file, cb) {
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `posts/${Date.now()}-${uuidv4()}.${fileExtension}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    /// image file filter
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

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
  location: z.string().max(100).optional(),
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

//* Create post API
router.post(
  "/",
  requireAuth,
  uploadImages,
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("API create post called");

    const userId = req.user!.userId;
    const files = req.files as Express.MulterS3.File[];
    const items = req.body.items;
    console.log("Items: ", items);
    // if (!files || files.length === 0) {
    //   return res.status(400).json({ errorMessage: "No images uploaded" });
    // }
    // 1. 驗證輸入數據
    let validationResult: CreatePostSchemaType | undefined;
    try {
      // 處理數字字段
      const postData = {
        ...req.body,
        categoryId: parseInt(req.body.categoryId),
        conditionLevel: parseInt(req.body.conditionLevel),
        items: items ? JSON.parse(items) : undefined,
      };

      validationResult = CreatePostSchema.parse(postData);
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
        validationResult.categoryId
      );
      if (!categoryExists) {
        return res.status(400).json({ errorMessage: "Invalid category" });
      }

      // 3. 開始數據庫事務
      //* Use connection to ensure atomicity
      connection = await dbPool.getConnection();
      await connection.beginTransaction();

      // 4. 插入貼文記錄
      const postInsertQuery = `
      INSERT INTO posts (
        user_id, title, content, status, type, location, tags, 
        category_id, condition_level, expires_at, created_at, updated_at, view_count, likes_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
    `;

      const postValues = [
        userId,
        validationResult.title,
        validationResult.content,
        validationResult.status,
        validationResult.type,
        validationResult.location || null,
        validationResult.tags || null,
        validationResult.categoryId,
        validationResult.conditionLevel,
        validationResult.expiresAt
          ? new Date(validationResult.expiresAt)
          : null,
      ];

      const [postResult] = await connection.execute<ResultSetHeader>(
        postInsertQuery,
        postValues
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

      // 5. 插入圖片記錄
      if (files && files.length > 0) {
        await insertImages(connection, postId, files);
      }

      // 6. 提交事務
      await connection.commit();

      // 7. 返回創建的貼文信息
      const getPostQuery = `
      SELECT 
        p.*,
        u.username,
        c.name_en as category_name_en,
        GROUP_CONCAT(i.image_url) as image_urls
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
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
      if (files && files.length > 0) {
        const fileUrls = files.map((file) => file.location);
        try {
          await deleteS3Files(fileUrls);
        } catch (s3Error) {
          console.error("Failed to cleanup S3 files:", s3Error);
        }
      }
      console.error("⚠️Create post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// 獲取貼文列表 (帶分頁和篩選)
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const category_id = req.query.category_id as string;
    const location = req.query.location as string;
    const status = (req.query.status as string) || "active";
    const search = req.query.search as string;

    let whereConditions = ["p.status = ?"];
    let queryParams: any[] = [status];

    if (category_id) {
      whereConditions.push("c.id = ?");
      queryParams.push(parseInt(category_id));
    }

    if (location) {
      whereConditions.push("p.location LIKE ?");
      queryParams.push(`%${location}%`);
    }

    if (search) {
      whereConditions.push(
        "(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)"
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
        GROUP_CONCAT(i.image_url) as image_urls,
        GROUP_CONCAT(i.thumbnail_url) as thumbnail_urls
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN images i ON p.id = i.post_id
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [posts] = await dbPool.execute<RowDataPacket[]>(
      postsQuery,
      queryParams
    );

    console.log("posts: ", posts);

    // 獲取總數
    const countQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
    `;

    const [countResult] = await dbPool.execute<RowDataPacket[]>(
      countQuery,
      queryParams
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

// 獲取單個貼文詳情
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

    // 更新瀏覽次數
    await dbPool.execute(
      "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
      [postId]
    );

    // 獲取貼文詳情
    const postQuery = `
      SELECT 
        p.*,
        u.username,
        u.public_id as author_public_id,
        u.email,
        u.avatar_url,
        c.name_en as category_name_en
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(postQuery, [postId]);

    if (rows.length === 0) {
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    // 獲取貼文圖片
    const imagesQuery =
      "SELECT * FROM images WHERE post_id = ? ORDER BY created_at";
    const [images] = await dbPool.execute<RowDataPacket[]>(imagesQuery, [
      postId,
    ]);

    // 將圖片 URL 轉換為逗號分隔的字符串格式
    const imageUrls = images.map((img: any) => img.image_url).join(",");
    const [items] = await dbPool.execute(
      `SELECT * FROM items WHERE post_id = ?`,
      [postId]
    );
    const post = {
      ...rows[0],
      image_urls: imageUrls,
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

/// like & unlike post api
router.use("/:id/like", likeRouter);

export default router;
