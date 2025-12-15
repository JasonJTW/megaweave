import express, { Request, Response } from "express";
const router = express.Router();

router.get("health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

export default router;
