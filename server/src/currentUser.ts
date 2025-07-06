import { Request, Response } from "express";
import { getUserFromCookie } from "./session";
import { requireAuth } from "./middleware/auth";
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
    return res.status(200).json({ user: req.user });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
