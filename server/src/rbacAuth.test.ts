import { Request, Response, RequestHandler } from "express";
import { requireAuth, requireRole } from "./middleware/auth";
import commentsRouter from "./comments";
import postsRouter from "./posts";
import userprofileRouter from "./userprofile";
import currentUserRouter from "./currentUser";
import adminRouter from "./admin";
import dbPool from "./utils/db";
import { postService } from "./services/postService";
import * as sessionModule from "./session";

// Mock external dependencies
jest.mock("./utils/db", () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

jest.mock("./services/postService", () => ({
  postService: {
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    generateAndSaveEmbedding: jest.fn(),
  },
}));

jest.mock("./session", () => ({
  getUserFromCookie: jest.fn(),
  updateUserSession: jest.fn(),
}));

jest.mock("./queue/queues", () => ({
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(true),
  enqueuePostEmbedding: jest.fn().mockResolvedValue(true),
}));

jest.mock("./utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(true),
}));

jest.mock("./utils/redis", () => ({
  getRedisClient: jest.fn(() => ({
    isOpen: true,
    isReady: true,
  })),
}));

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
}

function getRouteHandlers(router: unknown, path: string, method: "get" | "post" | "put" | "delete" | "patch"): RequestHandler[] {
  const actualRouter = (router as { default?: unknown }).default || router;
  const anyRouter = actualRouter as { stack?: RouterLayer[]; _router?: { stack?: RouterLayer[] } };
  const layers = anyRouter.stack || anyRouter._router?.stack;
  if (!layers) {
    throw new Error(`Router has no stack: keys=${Object.keys(actualRouter as object)}`);
  }
  const match = layers.find(
    (l) => l.route?.path === path && l.route?.methods[method] === true,
  );
  if (!match || !match.route) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return match.route.stack.map((s) => s.handle);
}

describe("RBAC and Resource Ownership Verification Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. requireAuth & requireRole Middleware with Cookie Tampering Defense", () => {
    it("requireAuth rejects unauthenticated requests with 401", async () => {
      (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValueOnce(null);

      const req = { cookies: {} } as unknown as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      await requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ errorMessage: "Please login first" });
      expect(next).not.toHaveBeenCalled();
    });

    it("requireAuth rejects invalid/corrupted session with 401", async () => {
      (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValueOnce({
        userId: null,
        email: "",
      });

      const req = { cookies: {} } as unknown as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      await requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Invalid session data. Please login again.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("requireRole prevents cookie-role tampering: client sends user-role=admin cookie but Redis has role=user", async () => {
      // Attacker has tampered with their client-side cookie to user-role=admin
      // BUT authoritative Redis session has role: 'user'
      const authoritativeSession = {
        userId: 42,
        email: "attacker@test.com",
        role: "user" as const,
        username: "attacker",
      };

      (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValueOnce(authoritativeSession);

      const req = {
        cookies: {
          "session-id": "valid-attacker-session-id",
          "user-role": "admin", // 🚨 Spoofed cookie in DevTools
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      const adminGuard = requireRole("admin");
      await adminGuard(req, res, next);

      // Must be rejected with 403 Forbidden based on authoritative Redis role
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: Insufficient permissions",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("requireRole allows request when authoritative session has matching role", async () => {
      const adminSession = {
        userId: 1,
        email: "admin@test.com",
        role: "admin" as const,
        username: "adminUser",
      };

      const req = {
        user: adminSession,
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      const adminGuard = requireRole("admin");
      await adminGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("2. Privileged Admin Endpoints (admin.ts & posts.ts)", () => {
    it("GET /api/admin/metrics returns metrics for admin user", async () => {
      const handlers = getRouteHandlers(adminRouter, "/metrics", "get");
      const handler = handlers[handlers.length - 1];

      (dbPool.query as jest.Mock).mockResolvedValueOnce([[ { 1: 1 } ]]);

      const req = {
        user: { userId: 1, role: "admin" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          dbStatus: "connected",
          redisStatus: "connected",
        }),
      );
    });

    it("POST /api/admin/cleanup returns success for admin user", async () => {
      const handlers = getRouteHandlers(adminRouter, "/cleanup", "post");
      const handler = handlers[handlers.length - 1];

      const req = {
        user: { userId: 1, role: "admin" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Admin cleanup executed successfully",
        }),
      );
    });

    it("POST /posts/:id/embedding enforces requireRole('admin')", async () => {
      const handlers = getRouteHandlers(postsRouter, "/:id/embedding", "post");
      // handlers: [requireAuth, requireRole('admin'), handler]
      const roleMiddleware = handlers[1];

      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "post-uuid-1" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      await roleMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: Insufficient permissions",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("3. Comments Ownership Verification (comments.ts)", () => {
    it("POST /comments rejects impersonated user_id with 403", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/", "post");
      const commentHandler = handlers[handlers.length - 1];

      // User 10 tries to post with user_id: 99
      const req = {
        user: { userId: 10, role: "user", username: "legitUser" },
        body: {
          post_id: 1,
          user_id: 99, // 🚨 Impersonating user 99
          content: "Malicious spoofed comment",
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Forbidden: You cannot post comments on behalf of another user",
        }),
      );
    });

    it("PUT /comments/:id rejects non-owner with 403", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "put");
      const commentHandler = handlers[handlers.length - 1];

      // Comment is owned by user 20
      (dbPool.execute as jest.Mock).mockResolvedValueOnce([
        [{ id: 5, user_id: 20, is_deleted: 0 }],
      ]);

      // Caller is user 10 (not owner, not admin)
      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "5" },
        body: { content: "Updated unauthorized content" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Forbidden: You are not the owner of this comment",
        }),
      );
    });

    it("PUT /comments/:id allows owner to update comment", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "put");
      const commentHandler = handlers[handlers.length - 1];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ id: 5, user_id: 10, is_deleted: 0 }]]) // SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "5" },
        body: { content: "Legitimate updated comment" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Comment updated successfully",
          commentId: 5,
        }),
      );
    });

    it("PUT /comments/:id allows admin to update any comment", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "put");
      const commentHandler = handlers[handlers.length - 1];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ id: 5, user_id: 20, is_deleted: 0 }]]) // Comment belongs to user 20
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

      const req = {
        user: { userId: 1, role: "admin" }, // Admin
        params: { id: "5" },
        body: { content: "Admin moderated comment" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("DELETE /comments/:id rejects non-owner with 403", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "delete");
      const commentHandler = handlers[handlers.length - 1];

      // Comment is owned by user 20
      (dbPool.execute as jest.Mock).mockResolvedValueOnce([
        [{ id: 7, user_id: 20, is_deleted: 0 }],
      ]);

      const req = {
        user: { userId: 10, role: "user" }, // user 10
        params: { id: "7" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Forbidden: You are not the owner of this comment",
        }),
      );
    });

    it("DELETE /comments/:id allows owner to delete comment", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "delete");
      const commentHandler = handlers[handlers.length - 1];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ id: 7, user_id: 10, is_deleted: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "7" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Comment deleted successfully",
          commentId: 7,
        }),
      );
    });

    it("DELETE /comments/:id allows admin to delete any comment", async () => {
      const handlers = getRouteHandlers(commentsRouter, "/:id", "delete");
      const commentHandler = handlers[handlers.length - 1];

      (dbPool.execute as jest.Mock)
        .mockResolvedValueOnce([[{ id: 7, user_id: 99, is_deleted: 0 }]]) // belongs to user 99
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const req = {
        user: { userId: 1, role: "admin" }, // Admin
        params: { id: "7" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await commentHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("4. Posts Ownership Verification (posts.ts)", () => {
    it("PUT /posts/:id rejects non-owner with 403", async () => {
      const handlers = getRouteHandlers(postsRouter, "/:id", "put");
      const putHandler = handlers[handlers.length - 1];

      (postService.updatePost as jest.Mock).mockRejectedValueOnce(new Error("FORBIDDEN"));

      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "p-uuid-123" },
        body: { title: "New Title" },
        files: [],
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await putHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: You are not the owner of this post",
      });
    });

    it("DELETE /posts/:id rejects non-owner with 403", async () => {
      const handlers = getRouteHandlers(postsRouter, "/:id", "delete");
      const deleteHandler = handlers[handlers.length - 1];

      (postService.deletePost as jest.Mock).mockRejectedValueOnce(new Error("FORBIDDEN"));

      const req = {
        user: { userId: 10, role: "user" },
        params: { id: "p-uuid-123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await deleteHandler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: You are not the owner of this post",
      });
    });

    it("DELETE /posts/:id passes userRole to postService and succeeds for admin or owner", async () => {
      const handlers = getRouteHandlers(postsRouter, "/:id", "delete");
      const deleteHandler = handlers[handlers.length - 1];

      (postService.deletePost as jest.Mock).mockResolvedValueOnce(undefined);

      const req = {
        user: { userId: 1, role: "admin" },
        params: { id: "p-uuid-123" },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await deleteHandler(req, res, jest.fn());
      expect(postService.deletePost).toHaveBeenCalledWith("p-uuid-123", 1, "admin");
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("5. User Profile Ownership Verification (userprofile.ts)", () => {
    it("POST /userprofile/bio rejects attempt to modify another user's bio with 403", async () => {
      const handlers = getRouteHandlers(userprofileRouter, "/bio", "post");
      const handler = handlers[handlers.length - 1];

      const req = {
        user: { userId: 10, role: "user" },
        body: {
          bio: "Tampered bio",
          user_id: 99, // 🚨 Attempting to modify user 99's profile
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: You cannot modify another user's profile",
      });
    });

    it("POST /userprofile/custom_name rejects attempt to modify another user's name with 403", async () => {
      const handlers = getRouteHandlers(userprofileRouter, "/custom_name", "post");
      const handler = handlers[handlers.length - 1];

      const req = {
        user: { userId: 10, role: "user" },
        body: {
          custom_name: "HackedName",
          userId: 99, // 🚨 Attempting to modify user 99's profile
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: You cannot modify another user's profile",
      });
    });
  });

  describe("6. Session Privilege Escalation Protection (currentUser.ts)", () => {
    it("POST /currentUser/update rejects user attempting to escalate role to admin with 403", async () => {
      const handlers = getRouteHandlers(currentUserRouter, "/update", "post");
      const handler = handlers[handlers.length - 1];

      const req = {
        user: { userId: 10, role: "user", username: "regularUser" },
        body: {
          updates: {
            role: "admin", // 🚨 Attempting privilege escalation
          },
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: Cannot change user role",
      });
    });

    it("POST /currentUser/update rejects user attempting to change userId with 403", async () => {
      const handlers = getRouteHandlers(currentUserRouter, "/update", "post");
      const handler = handlers[handlers.length - 1];

      const req = {
        user: { userId: 10, role: "user", username: "regularUser" },
        body: {
          updates: {
            userId: 1, // 🚨 Attempting to hijack user ID 1
          },
        },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await handler(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        errorMessage: "Forbidden: Cannot change user ID",
      });
    });
  });
});
