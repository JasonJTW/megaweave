//* conditions.ts
import { Request, Response, Router, NextFunction } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { HttpError } from "./utils/httpError";

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
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
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
    return next(error);
  }
});

// 獲取單個狀況等級詳情
router.get("/:level", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const level = parseInt(req.params.level);

    if (isNaN(level) || level < 1 || level > 5) {
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid condition level"));
    }

    const [conditions] = await dbPool.query<RowDataPacket[]>(
      `SELECT ${CONDITION_COLUMNS}
       FROM conditions
       WHERE level = ? AND status = 'active'`,
      [level],
    );

    if (conditions.length === 0) {
      return next(new HttpError(404, "CONDITION_NOT_FOUND", "Condition not found"));
    }

    res.status(200).json({
      message: "Condition retrieved successfully",
      condition: conditions[0],
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
