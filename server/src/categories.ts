//* categories.ts
import { Request, Response, Router } from "express";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";

const router = Router();

// 獲取所有分類
router.get("/", async (_req: Request, res: Response) => {
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
      ORDER BY name_en ASC
    `;

    const [categories] = await dbPool.query<RowDataPacket[]>(categoriesQuery);

    res.status(200).json({
      message: "Categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// 獲取單個分類詳情
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return res.status(400).json({ errorMessage: "Invalid category ID" });
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
      return res.status(404).json({ errorMessage: "Category not found" });
    }

    res.status(200).json({
      message: "Category retrieved successfully",
      category: categories[0],
    });
  } catch (error) {
    console.error("Get category error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

export default router;
