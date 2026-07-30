// currentUser.ts
import { Request, Response } from "express";
import {
  updateUserSession,
  RedisConnectionError,
  UpdateSessionError,
} from "./session";
import { requireAuth } from "./middleware/auth";
import _ from "lodash";
import Router from "express";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  console.log("Received Request for /api/currentUser");
  try {
    if (!req.user) {
      return res.status(401).json({
        errorMessage: "Please login first",
      });
    }
    console.log("Current user:", req.user);
    return res.status(200).json({ user: req.user });
  } catch (error) {
    console.error("Get current user error:", error);

    // ✅ 處理 Redis 連線錯誤
    if (error instanceof RedisConnectionError) {
      return res.status(503).json({
        errorMessage:
          "Service temporarily unavailable. Please try again later.",
      });
    }

    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        errorMessage: "Please login first",
      });
    }

    const updates = req.body.updates;
    console.log("User before update:", req.user);
    console.log("Received updates:", updates);

    if (!updates || _.isEqual(updates, req.user)) {
      return res.status(400).json({
        errorMessage:
          "No updates provided or updates are identical to current user data",
      });
    }

    const updatedUserSession = await updateUserSession(req, updates);
    console.log("User after update:", updatedUserSession);

    if (!updatedUserSession) {
      return res
        .status(500)
        .json({ errorMessage: "Failed to update user session" });
    }

    return res.status(200).json({ updatedUser: updatedUserSession });
  } catch (error) {
    console.error("Update current user error:", error);

    // ✅ 處理特定錯誤
    if (error instanceof RedisConnectionError) {
      return res.status(503).json({
        errorMessage:
          "Service temporarily unavailable. Please try again later.",
      });
    }

    if (error instanceof UpdateSessionError) {
      return res.status(400).json({
        errorMessage: error.message,
      });
    }

    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
