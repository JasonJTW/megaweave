import { Request, Response, Router, NextFunction } from "express";
import { removeUserSession } from "./session";
import dotenv from "dotenv";
dotenv.config();
const router = Router();

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeUserSession(req, res);
    return res.status(200).json({ message: "Sign out successful" });
  } catch (error) {
    return next(error);
  }
});

export default router;
