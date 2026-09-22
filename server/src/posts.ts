//* posts.ts

import { Request, Response, Router } from "express";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { randomUUID } from "crypto";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "./middleware/auth";
import likeRouter from "./like";
import { getUserFromCookie } from "./session";
import { handleError } from "./utils/errorHandler";
import { postService } from "./services/postService";
import { feedService } from "./services/feedService";
import { FEED_STRATEGY_HEADER, resolveFeedStrategy } from "./benchmark/feedStrategy";
import type { PostType } from "./types/post";
import { enqueueUserVectorUpdate } from "./queue/queues";
import { defaultImageStorage } from "./storage/ImageStorage";

dotenv.config();

const router = Router();
const UPLOAD_IMAGE_LIMIT = process.env.UPLOAD_IMAGE_LIMIT || "5";

/// Post validation Schema
const ItemSchema = z.object({
  title: z.string().min(1, "Item title is required").max(20, "Title too long"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

const CreatePostSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(60, "Title too long"),
  content: z
    .string()
    .min(3, "Content must be at least 3 characters")
    .max(1000, "Content too long"),
  status: z.enum(["active", "inactive"]).default("active"),
  place_id: z.string().optional(),
  location_name: z.string().optional(),
  location_url: z.string().optional(),
  full_address: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  route: z.string().optional(),
  zip: z.string().optional(),
  zip_code: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  type: z.enum(["wish", "share", "commons"] as [PostType, ...PostType[]]),
  tags: z.string().max(500).optional(),
  categoryId: z.number().int().positive("Invalid category ID"),
  conditionLevel: z.number().int().min(1).max(5, "Condition level must be 1-5"),
  expiresAt: z.string().datetime(),
  items: z
    .array(ItemSchema)
    .min(1, "At least one item is required")
    .max(20, "At most 20 items are allowed")
    .refine(
      (items) => {
        const titles = items.map((i) => i.title.trim().toLowerCase());
        return new Set(titles).size === titles.length;
      },
      { message: "Item titles must be unique" },
    )
    .optional(),
  stagingKeys: z.array(z.string()).max(parseInt(UPLOAD_IMAGE_LIMIT)).optional(),
});

type CreatePostSchemaType = z.infer<typeof CreatePostSchema>;

const PresignedUrlsSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1, "Filename is required"),
        contentType: z
          .string()
          .regex(/^image\//, "Content type must be an image"),
      }),
    )
    .min(1, "At least one file is required")
    .max(
      parseInt(UPLOAD_IMAGE_LIMIT),
      `Cannot exceed ${UPLOAD_IMAGE_LIMIT} files`,
    ),
});

//* Presigned URLs API for client-direct S3 staging upload
router.post(
  "/presigned-urls",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validationResult = PresignedUrlsSchema.parse(req.body);
      const urls = await Promise.all(
        validationResult.files.map(async (file) => {
          const ext = path.extname(file.filename) || ".webp";
          const stagingKey = `staging/posts/${Date.now()}-${randomUUID()}${ext}`;
          const presignedUrl = await defaultImageStorage.getPresignedUploadUrl(
            stagingKey,
            file.contentType,
            300,
          );
          return {
            stagingKey,
            presignedUrl,
          };
        }),
      );
      res.status(200).json({ urls });
    } catch (error) {
      console.error("Presigned URL generation error:", error);
      return handleError(error, res);
    }
  },
);

//* Create post API
router.post(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;

    let validationResult: CreatePostSchemaType;
    try {
      const postData = {
        ...req.body,
        categoryId:
          typeof req.body.categoryId === "string"
            ? parseInt(req.body.categoryId)
            : req.body.categoryId,
        conditionLevel:
          typeof req.body.conditionLevel === "string"
            ? parseInt(req.body.conditionLevel)
            : req.body.conditionLevel,
        expiresAt: req.body.expiresAt || req.body.expires_at,
        lat: req.body.lat !== undefined && req.body.lat !== null && req.body.lat !== ""
          ? parseFloat(req.body.lat)
          : undefined,
        lng: req.body.lng !== undefined && req.body.lng !== null && req.body.lng !== ""
          ? parseFloat(req.body.lng)
          : undefined,
        items:
          typeof req.body.items === "string"
            ? JSON.parse(req.body.items)
            : req.body.items,
        stagingKeys:
          typeof req.body.stagingKeys === "string"
            ? JSON.parse(req.body.stagingKeys)
            : req.body.stagingKeys,
      };

      validationResult = CreatePostSchema.parse(postData);
    } catch (error) {
      console.error("Create post validation error: ", error);
      return handleError(error, res);
    }

    try {
      const newPost = await postService.createPost(
        userId,
        validationResult,
      );

      res.status(201).json({
        message: "Post created successfully",
        post: newPost,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "INVALID_CATEGORY") {
        return res.status(400).json({ errorMessage: "Invalid category" });
      }
      console.error("⚠️ Create post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

// Get all posts api
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const category_id = req.query.category_id as string;
    const location = req.query.location as string;
    const city = req.query.city as string;
    const province = req.query.province as string;
    const status = (req.query.status as string) || "active";
    const search = req.query.search as string;
    const type = req.query.type as string;

    const result = await postService.listPosts({
      page,
      limit,
      category_id,
      location,
      city,
      province,
      status,
      search,
      type,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Get posts error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// 🌟 統一推薦 Feed API (Unified Hybrid Feed)
// GET /api/posts/feed?page=1&limit=20&type=share&category_id=1&lat=25.033&lng=121.565
router.get("/feed", async (req: Request, res: Response) => {
  const t0 = performance.now();
  try {
    const tSessionStart = performance.now();
    const session = await getUserFromCookie(req);
    const userId = session?.userId;
    const tSession = performance.now() - tSessionStart;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string | undefined;
    const category_id = req.query.category_id
      ? parseInt(req.query.category_id as string)
      : undefined;
    const search = req.query.search as string | undefined;
    const location = req.query.location as string | undefined;
    const city = req.query.city as string | undefined;
    const province = req.query.province as string | undefined;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const radius = req.query.radius
      ? parseFloat(req.query.radius as string)
      : undefined;
    const mode = req.query.mode as string | undefined;
    // 只有 benchmark 目標會回傳策略（並回應標頭讓 runner 確認實際採用的策略）；production 恆為 null
    const benchmarkStrategy = resolveFeedStrategy(req.headers[FEED_STRATEGY_HEADER]);
    if (benchmarkStrategy) res.setHeader(FEED_STRATEGY_HEADER, benchmarkStrategy);

    const tFeedStart = performance.now();
    const result = await feedService.getFeed({
      userId,
      page,
      limit,
      type,
      category_id,
      search,
      location,
      city,
      province,
      lat,
      lng,
      radius,
      mode,
      fullHydrationBaseline: benchmarkStrategy === "full-hydration",
    });
    const tFeed = performance.now() - tFeedStart;
    const tTotal = performance.now() - t0;

    res.setHeader(
      "Server-Timing",
      `session;dur=${tSession.toFixed(1)}, feed;dur=${tFeed.toFixed(1)}, total;dur=${tTotal.toFixed(1)}`,
    );

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "SEARCH_QUERY_TOO_LONG") {
      return res.status(400).json({ errorMessage: "Search query must be 300 characters or fewer" });
    }
    console.error("Get feed error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Edit post API (PUT /:id using public_id)
const EditPostSchema = CreatePostSchema.partial().extend({
  expiresAt: z.string().datetime().optional().nullable(),
  deleteImageIds: z.array(z.number().int().positive()).optional(),
  stagingKeys: z.array(z.string()).max(parseInt(UPLOAD_IMAGE_LIMIT)).optional(),
});

type EditPostSchemaType = z.infer<typeof EditPostSchema>;

router.put(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const publicId = req.params.id;
    const userId = req.user!.userId;

    if (!publicId) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

    let incoming: EditPostSchemaType;
    try {
      const deleteImageIdsRaw = req.body.deleteImageIds || req.body.deletedImageIds;
      const raw = {
        ...req.body,
        ...(req.body.categoryId !== undefined && {
          categoryId:
            typeof req.body.categoryId === "string"
              ? parseInt(req.body.categoryId)
              : req.body.categoryId,
        }),
        ...(req.body.conditionLevel !== undefined && {
          conditionLevel:
            typeof req.body.conditionLevel === "string"
              ? parseInt(req.body.conditionLevel)
              : req.body.conditionLevel,
        }),
        ...(req.body.lat !== undefined && req.body.lat !== null && req.body.lat !== "" && {
          lat: parseFloat(req.body.lat),
        }),
        ...(req.body.lng !== undefined && req.body.lng !== null && req.body.lng !== "" && {
          lng: parseFloat(req.body.lng),
        }),
        ...(req.body.expiresAt === "" && { expiresAt: null }),
        ...(req.body.items !== undefined && {
          items:
            typeof req.body.items === "string"
              ? JSON.parse(req.body.items)
              : req.body.items,
        }),
        ...(deleteImageIdsRaw !== undefined && {
          deleteImageIds:
            typeof deleteImageIdsRaw === "string"
              ? JSON.parse(deleteImageIdsRaw)
              : deleteImageIdsRaw,
        }),
        ...(req.body.stagingKeys !== undefined && {
          stagingKeys:
            typeof req.body.stagingKeys === "string"
              ? JSON.parse(req.body.stagingKeys)
              : req.body.stagingKeys,
        }),
      };
      incoming = EditPostSchema.parse(raw);
    } catch (error) {
      console.error("Edit post validation error:", error);
      return handleError(error, res);
    }

    const userRole = req.user!.role;
    try {
      const updatedPost = await postService.updatePost(
        publicId,
        userId,
        incoming,
        userRole,
      );

      res.status(200).json({
        message: "Post updated successfully",
        post: updatedPost,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === "POST_NOT_FOUND") {
          return res.status(404).json({ errorMessage: "Post not found" });
        }
        if (error.message === "FORBIDDEN") {
          return res.status(403).json({
            errorMessage: "Forbidden: You are not the owner of this post",
          });
        }
        if (error.message === "INVALID_CATEGORY") {
          return res.status(400).json({ errorMessage: "Invalid category" });
        }
      }
      console.error("⚠️ Edit post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

// Delete post api
router.delete(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const publicId = req.params.id;
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      if (!publicId) {
        return res.status(400).json({ errorMessage: "Invalid post ID" });
      }

      await postService.deletePost(publicId, userId, userRole);

      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "POST_NOT_FOUND") {
          return res.status(404).json({ errorMessage: "Post not found" });
        }
        if (error.message === "FORBIDDEN") {
          return res.status(403).json({
            errorMessage: "Forbidden: You are not the owner of this post",
          });
        }
      }
      console.error("Delete post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

//* Get post details api (using public_id)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const publicId = req.params.id;
    if (!publicId) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

    const session = await getUserFromCookie(req);
    const currentUserId = session?.userId;
    const viewerIp =
      (req.headers["x-forwarded-for"] as string) || req.ip || "unknown_ip";

    const post = await postService.getPostByPublicId(publicId, {
      currentUserId,
      viewerIp,
    });

    if (!post) {
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    // 🧠 登入使用者看非自己的貼文 → 觸發興趣向量更新（fire-and-forget）
    if (currentUserId && post.user_id !== currentUserId) {
      enqueueUserVectorUpdate({
        userId: currentUserId,
        postId: post.id,
        action: "view",
      }).catch((err) =>
        console.error("Failed to enqueue user-vector (view):", err),
      );
    }

    res.status(200).json({ post });
  } catch (error) {
    console.error("Get post error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Manual Trigger Embedding API (POST /:id/embedding)
// 安全防護：限管理員 (admin) 角色可手動呼叫，嚴格防止一般用戶調用消耗 OpenAI Credits
router.post(
  "/:id/embedding",
  requireAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idOrPublicId = req.params.id;
      let postId = parseInt(idOrPublicId);
      if (isNaN(postId)) {
        const resolved = await postService.getPostIdByPublicId(idOrPublicId);
        if (!resolved) {
          return res.status(404).json({ errorMessage: "Post not found" });
        }
        postId = resolved;
      }

      const result = await postService.generatePostEmbeddingSync(postId);

      return res.status(200).json({
        message: `Embedding generated and saved successfully for post #${postId}`,
        postId,
        ...result,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "POST_NOT_FOUND") {
        return res.status(404).json({ errorMessage: "Post not found" });
      }
      console.error("Manual generate embedding error:", error);
      return res
        .status(500)
        .json({ errorMessage: "Internal server error", error });
    }
  },
);

router.use("/:postId/like", likeRouter);

export default router;
