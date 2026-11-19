/**
 * GET /api/userprofile/public/:uuid 任何人都能呼叫，不能回帳號 email（登入帳號、找回密碼用，使用者沒選擇公開）。
 * 使用者自己填的 contact_email／contact_phone 是公開聯絡方式，照常回。
 */
import type { Express } from "express";
import { request } from "./testUtils/testApi";

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();
const USER_UUID = "123e4567-e89b-42d3-a456-426614174000";

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: jest.fn(async (rawSql: string) => {
      const sql = normalize(rawSql);
      if (sql.includes("FROM users WHERE public_id = ?")) {
        //* 模擬 SELECT * 的列：即使 DB 回了 email，回應也不能帶出去
        return [
          [
            {
              id: 10,
              public_id: USER_UUID,
              username: "alice",
              email: "alice@example.com",
              avatar_url: null,
              avatar_key: null,
              role: "user",
              created_at: "2025-01-01T00:00:00.000Z",
            },
          ],
        ];
      }
      if (sql.includes("FROM user_profiles WHERE user_id = ?")) {
        return [
          [
            {
              user_id: 10,
              custom_name: "Alice",
              bio: "hi",
              contact_email: "public@example.com",
              contact_phone: null,
            },
          ],
        ];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  },
}));

describe("GET /api/userprofile/public/:uuid", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  it("does not return the account email", async () => {
    const res = await request(app).get(`/api/userprofile/public/${USER_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("email");
    expect(JSON.stringify(res.body)).not.toContain("alice@example.com");
  });

  it("still returns the profile and the contact details the user chose to publish", async () => {
    const res = await request(app).get(`/api/userprofile/public/${USER_UUID}`);

    expect(res.body).toMatchObject({
      public_id: USER_UUID,
      username: "Alice",
      bio: "hi",
      contact_email: "public@example.com",
    });
  });
});
