// currentUser.ts
import { Request, Response, NextFunction } from "express";
import {
  updateUserSession,
  RedisConnectionError,
  UpdateSessionError,
} from "./session";
import { requireAuth } from "./middleware/auth";
import _ from "lodash";
import Router from "express";
import dbPool from "./utils/db";
import { RowDataPacket } from "mysql2";
import { HttpError } from "./utils/httpError";

const router = Router();

//* session 相關錯誤轉成可預期的 HttpError，其餘交給 errorMiddleware 當 500
function toSessionHttpError(error: unknown) {
  if (error instanceof RedisConnectionError) {
    console.error("Session store unavailable:", error);
    return new HttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable. Please try again later.",
    );
  }
  if (error instanceof UpdateSessionError) {
    return new HttpError(401, "UNAUTHENTICATED", error.message);
  }
  return error;
}

router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  console.log("Received Request for /api/currentUser");
  try {
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
    }

    // Ensure req.user.username is in sync with user_profiles.custom_name
    try {
      const [profiles] = await dbPool.execute<RowDataPacket[]>(
        "SELECT custom_name FROM user_profiles WHERE user_id = ?",
        [req.user.userId],
      );
      const customName = profiles[0]?.custom_name?.trim();
      if (customName && req.user.username !== customName) {
        req.user.username = customName;
        updateUserSession(req, { username: customName }).catch((err) =>
          console.error("Failed to sync updated custom_name to session:", err),
        );
      }
    } catch (dbErr) {
      console.error("Error checking custom_name in currentUser:", dbErr);
    }

    console.log("Current user:", req.user);
    return res.status(200).json({ user: req.user });
  } catch (error) {
    return next(toSessionHttpError(error));
  }
});

router.post("/update", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Please login first"));
    }

    const updates = req.body.updates;
    console.log("User before update:", req.user);
    console.log("Received updates:", updates);

    // 安全防護：禁止一般使用者任意竄改自身權限角色或使用者 ID（防範 Privilege Escalation）
    if (updates) {
      if (updates.role && updates.role !== req.user.role) {
        return next(new HttpError(403, "FORBIDDEN", "Forbidden: Cannot change user role"));
      }
      if (updates.userId && Number(updates.userId) !== req.user.userId) {
        return next(new HttpError(403, "FORBIDDEN", "Forbidden: Cannot change user ID"));
      }
    }

    if (!updates || _.isEqual(updates, req.user)) {
      return next(
        new HttpError(
          400,
          "INVALID_REQUEST",
          "No updates provided or updates are identical to current user data",
        ),
      );
    }

    const updatedUserSession = await updateUserSession(req, updates);
    console.log("User after update:", updatedUserSession);

    if (!updatedUserSession) {
      return next(new Error("Failed to update user session"));
    }

    return res.status(200).json({ updatedUser: updatedUserSession });
  } catch (error) {
    return next(toSessionHttpError(error));
  }
});

export default router;
