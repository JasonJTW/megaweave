import { Request, Response, Router } from "express";
import { removeUserSession } from "./session";
import { requireAuth } from "./middleware/auth";
import dotenv from "dotenv";
dotenv.config();
const COOKIE_SESSION_KEY = process.env.COOKIE_SESSION_KEY!;
const router = Router();

if (!COOKIE_SESSION_KEY) {
  throw new Error("Missing required environment variable: COOKIE_SESSION_KEY");
}

router.post("/", async (req: Request, res: Response) => {
  try {
    await removeUserSession(req, res);
  } catch (error) {
    console.error("Sign out error:", error);
    /// Clear the session cookie even if there is an error
    res.clearCookie(COOKIE_SESSION_KEY);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
