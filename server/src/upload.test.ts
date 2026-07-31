// upload.test.ts
import { insertImages } from "./upload";
import type { PoolConnection } from "mysql2/promise";

// ---------------------------------------------------------------------------
// Fake PoolConnection — captures every query() call so we can inspect the SQL
// ---------------------------------------------------------------------------
function makeFakeConnection() {
  return {
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }, undefined]),
  } as unknown as PoolConnection & { query: jest.Mock };
}

// ---------------------------------------------------------------------------
// Known-good columns from the actual `images` DDL:
//   post_id | s3_key | alt_text | created_at
// ---------------------------------------------------------------------------
const imagesAllowedColumns = new Set([
  "post_id",
  "s3_key",
  "alt_text",
  "created_at",
]);

/**
 * Extract the column list from an INSERT statement:
 *   INSERT INTO images (col1, col2, ...) VALUES ?
 *                      ^^^^^^^^^^^^^^^^^^^
 */
function parseInsertColumns(sql: string): string[] {
  const match = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
  if (!match) throw new Error(`Could not parse column list from SQL:\n${sql}`);
  return match[1].split(",").map((c) => c.trim());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("insertImages", () => {
  it("only references columns that exist in the images table", async () => {
    const connection = makeFakeConnection();

    await insertImages(connection, 42, [
      { key: "posts/abc.webp" },
      { key: "posts/def.webp" },
    ]);

    expect(connection.query).toHaveBeenCalledTimes(1);

    const [sql] = connection.query.mock.calls[0];
    const columns = parseInsertColumns(sql);

    // Every column in the INSERT must be present in the real schema
    for (const col of columns) {
      expect(imagesAllowedColumns).toContain(col);
    }
  });

  it("inserts one row per image with correct positional values", async () => {
    const connection = makeFakeConnection();

    await insertImages(connection, 99, [
      { key: "posts/img-1.webp" },
      { key: "posts/img-2.webp" },
    ]);

    // query() is called once with bulk VALUES ?
    expect(connection.query).toHaveBeenCalledTimes(1);

    // The second argument is [[rows]] — mysql2 bulk-insert shape
    const [, values] = connection.query.mock.calls[0];
    const rows = (values as unknown[][][])[0];
    expect(rows).toHaveLength(2);

    // Each row: [post_id, s3_key, alt_text, created_at]
    expect(rows[0][0]).toBe(99); // post_id
    expect(rows[0][1]).toBe("posts/img-1.webp"); // s3_key
    expect(typeof rows[0][2]).toBe("string"); // alt_text
    expect(rows[0][3]).toBeInstanceOf(Date); // created_at

    expect(rows[1][1]).toBe("posts/img-2.webp");
  });

  it("is a no-op when the images array is empty", async () => {
    const connection = makeFakeConnection();

    await insertImages(connection, 1, []);

    expect(connection.query).not.toHaveBeenCalled();
  });
});
