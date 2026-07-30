import { Request, Response, Router } from "express";
import { removeUserSession } from "./session";
import dotenv from "dotenv";
dotenv.config();
const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    await removeUserSession(req, res);
    return res.status(200).json({ message: "Sign out successful" });
  } catch (error) {
    console.error("Sign out error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
