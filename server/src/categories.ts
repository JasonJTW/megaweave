//* categories.ts
import { Request, Response, Router, NextFunction } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { HttpError } from "./utils/httpError";

const router = Router();

// 獲取所有分類
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categoriesQuery = `
      SELECT 
        id,
        name_en,
        description,
        status,
        created_at,
        updated_at
      FROM categories 
      WHERE status = 'active'
      ORDER BY id ASC
    `;

    const [categories] = await dbPool.query<RowDataPacket[]>(categoriesQuery);

    res.status(200).json({
      message: "Categories retrieved successfully",
      categories,
    });
  } catch (error) {
    return next(error);
  }
});

// 獲取單個分類詳情
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid category ID"));
    }

    const categoryQuery = `
      SELECT 
        id,
        name_en,
        description,
        status,
        created_at,
        updated_at
      FROM categories 
      WHERE id = ?
    `;

    const [categories] = await dbPool.query<RowDataPacket[]>(categoryQuery, [
      categoryId,
    ]);

    if (categories.length === 0) {
      return next(
        new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found"),
      );
    }

    res.status(200).json({
      message: "Category retrieved successfully",
      category: categories[0],
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
