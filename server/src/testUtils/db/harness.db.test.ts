import type { RowDataPacket } from "mysql2/promise";
import dbPool from "../../utils/db";
import { closeDatabase, resetDb } from "./reset";
import { createPost, createUser } from "./fixtures";

beforeEach(resetDb);
afterAll(closeDatabase);

describe("test:db harness", () => {
  it("runs against the schema.sql database and keeps reference data across resets", async () => {
    const author = await createUser("alice");
    const post = await createPost(author, { items: [{ title: "Desk", quantity: 2 }] });

    const [items] = await dbPool.execute<RowDataPacket[]>(
      "SELECT title, quantity FROM items WHERE post_id = ?",
      [post.id],
    );
    expect(items).toEqual([{ title: "Desk", quantity: 2 }]);

    await resetDb();
    const [users] = await dbPool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM users");
    const [categories] = await dbPool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM categories");
    expect(Number(users[0].n)).toBe(0);
    expect(Number(categories[0].n)).toBeGreaterThan(0);
  });
});
