//* posts.ts

import { Request, Response, Router } from "express";
import { z } from "zod";
import dotenv from "dotenv";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "./middleware/auth";
import { diskUpload } from "./upload";
import likeRouter from "./like";
import { getUserFromCookie } from "./session";
import { handleError } from "./utils/errorHandler";
import { postService } from "./services/postService";
import type { PostType } from "./types/post";

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
  full_address: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  route: z.string().optional(),
  zip: z.string().optional(),
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
});

type CreatePostSchemaType = z.infer<typeof CreatePostSchema>;

//* Create post API
router.post(
  "/",
  requireAuth,
  diskUpload.array("images", parseInt(UPLOAD_IMAGE_LIMIT)),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];
    const items = req.body.items;

    let validationResult: CreatePostSchemaType;
    try {
      const postData = {
        ...req.body,
        categoryId: parseInt(req.body.categoryId),
        conditionLevel: parseInt(req.body.conditionLevel),
        expiresAt: req.body.expires_at,
        lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
        lng: req.body.lng ? parseFloat(req.body.lng) : undefined,
        items: items ? JSON.parse(items) : undefined,
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
        files,
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

//* Get user's posts api
router.get("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userPosts = await postService.getUserPosts(userId);
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

    const session = await getUserFromCookie(req);
    const currentUserId = session?.userId;
    const viewerIp =
      (req.headers["x-forwarded-for"] as string) || req.ip || "unknown_ip";

    const post = await postService.getPostById(postId, {
      currentUserId,
      viewerIp,
    });

    if (!post) {
      return res.status(404).json({ errorMessage: "Post not found" });
    }

    res.status(200).json({ post });
  } catch (error) {
    console.error("Get post error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

//* Edit post API (PUT /:id)
const EditPostSchema = CreatePostSchema.partial().extend({
  expiresAt: z.string().datetime().optional().nullable(),
  deleteImageIds: z.array(z.number().int().positive()).optional(),
});

type EditPostSchemaType = z.infer<typeof EditPostSchema>;

router.put(
  "/:id",
  requireAuth,
  diskUpload.array("images", parseInt(UPLOAD_IMAGE_LIMIT)),
  async (req: AuthenticatedRequest, res: Response) => {
    const postId = parseInt(req.params.id);
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];

    if (isNaN(postId)) {
      return res.status(400).json({ errorMessage: "Invalid post ID" });
    }

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

    try {
      const updatedPost = await postService.updatePost(
        postId,
        userId,
        incoming,
        files,
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

      await postService.deletePost(postId, userId);
      res.status(200).json({ message: "Post deleted successfully" });
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
      }
      console.error("Delete post error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

//* Manual Trigger Embedding API (POST /:id/embedding)
// 安全防護：限管理員 (admin) 角色可手動呼叫，嚴格防止一般用戶調用消耗 OpenAI Credits
router.post(
  "/:id/embedding",
  requireAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const postId = parseInt(req.params.id);

      if (isNaN(postId)) {
        return res.status(400).json({ errorMessage: "Invalid post ID" });
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
