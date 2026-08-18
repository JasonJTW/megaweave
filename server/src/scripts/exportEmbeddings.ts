import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mysql, { RowDataPacket } from "mysql2/promise";

//* cd server
//* npx ts-node src/scripts/exportEmbeddings.ts
// 載入環境變數（可根據需求調整路徑，例如 .env.development）
dotenv.config({ path: path.resolve(__dirname, "../../.env.development") });

interface PostRow extends RowDataPacket {
  id: number;
  user_id: number;
  title: string;
  type: string;
  status: string;
  tags: string | null;
  category_name: string | null;
  condition_name: string | null;
  province: string | null;
  city: string | null;
  view_count: number;
  likes_count: number;
  comment_count: number;
  hot_score: number;
  created_at: Date | string;
  embedding: string | number[] | null;
}

// 清理字串以防破壞 TSV 格式（將換行符號與 Tab 轉為空格）
function cleanTsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\t\r\n]+/g, " ")
    .trim();
}

async function exportEmbeddings() {
  const outputDir = path.resolve(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const vectorsPath = path.join(outputDir, "vectors.tsv");
  const metadataPath = path.join(outputDir, "metadata.tsv");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "megaweave",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  });

  console.log("🚀 連接資料庫成功，開始查詢資料...");

  try {
    // 透過 JOIN 將 category_id 與 condition_level 轉成名稱 (name)
    const sql = `
      SELECT 
        p.id,
        p.user_id,
        p.title,
        p.type,
        p.status,
        p.tags,
        c.name AS category_name,
        cond.name AS condition_name,
        l.province,
        l.city,
        p.view_count,
        p.likes_count,
        p.comment_count,
        p.hot_score,
        p.created_at,
        p.embedding
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN \`conditions\` cond ON p.condition_level = cond.level
      LEFT JOIN locations l ON p.location_id = l.id
      WHERE p.embedding IS NOT NULL
        AND p.deleted_at IS NULL
      ORDER BY p.id ASC;
    `;

    const [rows] = await connection.query<PostRow[]>(sql);
    console.log(`📊 共撈取到 ${rows.length} 筆候選資料...`);

    const vectorsStream = fs.createWriteStream(vectorsPath, {
      encoding: "utf8",
    });
    const metadataStream = fs.createWriteStream(metadataPath, {
      encoding: "utf8",
    });

    // 寫入 metadata.tsv 表頭 (Header)
    const metadataHeaders = [
      "id",
      "title",
      "type",
      "status",
      "category",
      "condition",
      "location",
      "tags",
      "view_count",
      "likes_count",
      "comment_count",
      "hot_score",
      "created_at",
    ];
    metadataStream.write(metadataHeaders.join("\t") + "\n");

    let exportedCount = 0;

    for (const row of rows) {
      // 解析 embedding（MySQL JSON 欄位可能為已解析的 Array 或 JSON 字串）
      let vector: number[] | null = null;
      if (typeof row.embedding === "string") {
        try {
          vector = JSON.parse(row.embedding);
        } catch {
          vector = null;
        }
      } else if (Array.isArray(row.embedding)) {
        vector = row.embedding;
      }

      // 如果 embedding 為空或非陣列則跳過
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        continue;
      }

      // 組合地區字串
      const location = [row.city, row.province].filter(Boolean).join(", ");

      // 1. 寫入 vectors.tsv（以 \t 分隔每個維度數值）
      vectorsStream.write(vector.join("\t") + "\n");

      // 2. 寫入 metadata.tsv（以 \t 分隔各屬性）
      const metadataValues = [
        cleanTsv(row.id),
        cleanTsv(row.title),
        cleanTsv(row.type),
        cleanTsv(row.status),
        cleanTsv(row.category_name || "Unknown"),
        cleanTsv(row.condition_name || "Unknown"),
        cleanTsv(location),
        cleanTsv(row.tags),
        cleanTsv(row.view_count),
        cleanTsv(row.likes_count),
        cleanTsv(row.comment_count),
        cleanTsv(row.hot_score),
        cleanTsv(row.created_at),
      ];
      metadataStream.write(metadataValues.join("\t") + "\n");

      exportedCount++;
    }

    vectorsStream.end();
    metadataStream.end();

    console.log(`✅ 匯出完成！共成功匯出 ${exportedCount} 筆向量資料。`);
    console.log(`📁 向量檔: ${vectorsPath}`);
    console.log(`📁 詮釋資料檔: ${metadataPath}`);
  } catch (error) {
    console.error("❌ 匯出過程發生錯誤:", error);
  } finally {
    await connection.end();
  }
}

exportEmbeddings();
