//* conditions.ts
import { Request, Response, Router } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";

const router = Router();

// Conditions are reference data: `name` / `description` are the English source
// strings, and the UI shows the locale's own wording keyed by level
// (see client/i18n/referenceNames.ts).
const CONDITION_COLUMNS = `
  id,
  level,
  name,
  description,
  status,
  created_at,
  updated_at
`;

// 獲取所有狀況等級
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [conditions] = await dbPool.query<RowDataPacket[]>(
      `SELECT ${CONDITION_COLUMNS}
       FROM conditions
       WHERE status = 'active'
       ORDER BY level ASC`,
    );

    res.status(200).json({
      message: "Conditions retrieved successfully",
      conditions,
    });
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

    const [conditions] = await dbPool.query<RowDataPacket[]>(
      `SELECT ${CONDITION_COLUMNS}
       FROM conditions
       WHERE level = ? AND status = 'active'`,
      [level],
    );

    if (conditions.length === 0) {
      return res.status(404).json({ errorMessage: "Condition not found" });
    }

    res.status(200).json({
      message: "Condition retrieved successfully",
      condition: conditions[0],
    });
  } catch (error) {
    console.error("Get condition error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
