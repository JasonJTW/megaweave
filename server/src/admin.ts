import Router, { Request, Response } from "express";
import { requireAuth, requireRole } from "./middleware/auth";
import dbPool from "./utils/db";
import { getRedisClient } from "./utils/redis";

const router = Router();

// 權限防護：本路由下所有操作一律強制需要 admin 角色（驗證 Redis session）
router.use(requireAuth, requireRole("admin"));

/**
 * GET /api/admin/metrics
 * 系統與資料庫全域狀態監控指標 (Privileged Metrics API)
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();

    let dbStatus = "connected";
    try {
      await dbPool.query("SELECT 1");
    } catch {
      dbStatus = "disconnected";
    }

    let redisStatus = "connected";
    try {
      const redis = getRedisClient();
      if (!redis.isOpen) {
        redisStatus = "disconnected";
      }
    } catch {
      redisStatus = "disconnected";
    }

    return res.status(200).json({
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
      },
      dbStatus,
      redisStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin metrics error:", error);
    return res.status(500).json({ errorMessage: "Failed to collect metrics" });
  }
});

/**
 * POST /api/admin/cleanup
 * 系統定時與手動資源清理作業 (Privileged Cleanup API)
 */
router.post("/cleanup", async (_req: Request, res: Response) => {
  try {
    // 範例清理作業：清理軟刪除殘留或快取日誌
    return res.status(200).json({
      message: "Admin cleanup executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin cleanup error:", error);
    return res.status(500).json({ errorMessage: "Failed to execute cleanup" });
  }
});

export default router;
