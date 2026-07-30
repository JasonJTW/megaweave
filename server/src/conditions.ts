//* conditions.ts
import { Request, Response, Router } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";

const router = Router();

// 獲取所有狀況等級
router.get("/", async (_req: Request, res: Response) => {
  try {
    // 嘗試從數據庫讀取
    const conditionsQuery = `
      SELECT 
        id,
        level,
        name,
        description,
        status,
        created_at,
        updated_at
      FROM conditions 
      WHERE status = 'active'
      ORDER BY level ASC
    `;

    try {
      const [conditions] = await dbPool.query<RowDataPacket[]>(conditionsQuery);
      res.status(200).json({
        message: "Conditions retrieved successfully",
        conditions,
      });
    } catch {
      // 如果沒有 conditions 表，返回固定的選項
      console.warn("Conditions table not found, returning static options");
      const staticConditions = [
        {
          id: 1,
          level: 1,
          name: "全新",
          description: "商品全新未使用，包裝完整",
        },
        {
          id: 2,
          level: 2,
          name: "近全新",
          description: "使用次數極少，幾乎全新狀態",
        },
        {
          id: 3,
          level: 3,
          name: "良好",
          description: "使用正常，功能完好，外觀良好",
        },
        {
          id: 4,
          level: 4,
          name: "普通",
          description: "有使用痕跡，但功能正常",
        },
        {
          id: 5,
          level: 5,
          name: "需要維修",
          description: "有明顯瑕疵或需要修理",
        },
      ];

      res.status(200).json({
        message: "Conditions retrieved successfully",
        conditions: staticConditions,
      });
    }
  } catch (error) {
    console.error("Get conditions error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// 獲取單個狀況等級詳情
router.get("/:level", async (req: Request, res: Response) => {
  try {
    const level = parseInt(req.params.level);

    if (isNaN(level) || level < 1 || level > 5) {
      return res.status(400).json({ errorMessage: "Invalid condition level" });
    }

    try {
      const conditionQuery = `
        SELECT 
          id,
          level,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM conditions 
        WHERE level = ? AND status = 'active'
      `;

      const [conditions] = await dbPool.query<RowDataPacket[]>(conditionQuery, [
        level,
      ]);

      if (conditions.length === 0) {
        return res.status(404).json({ errorMessage: "Condition not found" });
      }

      res.status(200).json({
        message: "Condition retrieved successfully",
        condition: conditions[0],
      });
    } catch {
      // 如果沒有 conditions 表，返回對應的靜態選項
      const staticConditions = [
        {
          id: 1,
          level: 1,
          name: "Brand New",
          description: "Unused, sealed in original packaging",
        },
        {
          id: 2,
          level: 2,
          name: "Like New",
          description: "Minimal signs of use",
        },
        {
          id: 3,
          level: 3,
          name: "Good",
          description: "Normal wear, fully functional",
        },
        {
          id: 4,
          level: 4,
          name: "Fair",
          description: "Noticeable wear, fully functional",
        },
        {
          id: 5,
          level: 5,
          name: "For Parts or Repair",
          description: "Damaged or not fully functional",
        },
      ];

      const condition = staticConditions.find((c) => c.level === level);

      if (!condition) {
        return res.status(404).json({ errorMessage: "Condition not found" });
      }

      res.status(200).json({
        message: "Condition retrieved successfully",
        condition,
      });
    }
  } catch (error) {
    console.error("Get condition error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
