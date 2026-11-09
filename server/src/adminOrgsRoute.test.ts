/**
 * Platform Admin 開通組織（#134，PRD 0001 §5.1、ADR 0003）
 *
 * 透過 HTTP 測 `/api/admin/orgs`：只有 Platform Admin（全站 `users.role = 'admin'`）能建立／編輯組織，
 * 第一位 Org Admin 用已註冊帳號的 email 指定，未註冊回 EMAIL_NOT_REGISTERED。
 * MySQL 換成記憶體裡的假資料表（只認得 orgService 用到的語句），斷言停在 HTTP 回應。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import adminRouter from "./admin";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { createFakeOrgDb, FakeOrgDb } from "./testUtils/fakeOrgDb";

let fakeDb: FakeOrgDb;

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => fakeDb.connection.query(...args),
    execute: (...args: unknown[]) => fakeDb.connection.execute(...args),
    getConnection: () => Promise.resolve(fakeDb.connection),
  },
}));

jest.mock("./session", () => ({
  getUserFromCookie: jest.fn(),
  updateUserSession: jest.fn(),
}));

jest.mock("./utils/redis", () => ({
  getRedisClient: jest.fn(() => ({ isOpen: true, isReady: true })),
}));

const UNKNOWN_ORG_ID = "123e4567-e89b-42d3-a456-426614174000";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use(errorMiddleware);
  return app;
}

function signInAs(role: "admin" | "user" | "contributor") {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue({
    userId: 1,
    role,
    username: "someone",
    email: "someone@example.com",
    public_id: "u-1",
    joined_at: new Date(),
  });
}

function signOut() {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue(null);
}

async function createOrg(body: Record<string, unknown>) {
  return request(makeApp()).post("/api/admin/orgs").send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeDb = createFakeOrgDb({
    users: [
      { id: 7, email: "admin@school.edu.tw" },
      { id: 8, email: "second@school.edu.tw" },
    ],
  });
});

describe("permissions", () => {
  it.each(["user", "contributor"] as const)(
    "a %s cannot create an org",
    async (role) => {
      signInAs(role);

      const res = await createOrg({
        name: "大量國小",
        orgAdminEmail: "admin@school.edu.tw",
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(fakeDb.organizations).toHaveLength(0);
    },
  );

  it("a signed-out visitor cannot create an org", async () => {
    signOut();

    const res = await createOrg({
      name: "大量國小",
      orgAdminEmail: "admin@school.edu.tw",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("a non-admin cannot list or edit orgs", async () => {
    signInAs("admin");
    const created = await createOrg({
      name: "大量國小",
      orgAdminEmail: "admin@school.edu.tw",
    });
    signInAs("user");

    const list = await request(makeApp()).get("/api/admin/orgs");
    const edit = await request(makeApp())
      .patch(`/api/admin/orgs/${created.body.org.id}`)
      .send({ name: "改名" });

    expect(list.status).toBe(403);
    expect(edit.status).toBe(403);
    expect(fakeDb.organizations[0].name).toBe("大量國小");
  });
});

describe("POST /api/admin/orgs", () => {
  beforeEach(() => signInAs("admin"));

  it("creates an org with PRD defaults and makes the email's account its first Org Admin", async () => {
    const res = await createOrg({
      name: "大量國小",
      orgAdminEmail: "admin@school.edu.tw",
    });

    expect(res.status).toBe(201);
    expect(res.body.org).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "大量國小",
      publisherDisplay: "org",
      isDemo: false,
      autoReleaseEnabled: true,
      autoReleaseDays: 30,
      orgAdmins: [{ email: "admin@school.edu.tw" }],
    });
    expect(fakeDb.memberships).toEqual([
      expect.objectContaining({
        user_id: 7,
        org_role: "admin",
        access_level: "internal",
      }),
    ]);
  });

  it("stores the chosen settings", async () => {
    const res = await createOrg({
      name: "演示企業",
      publisherDisplay: "anonymous",
      isDemo: true,
      autoReleaseEnabled: false,
      autoReleaseDays: 14,
      orgAdminEmail: "admin@school.edu.tw",
    });

    expect(res.status).toBe(201);
    expect(res.body.org).toMatchObject({
      name: "演示企業",
      publisherDisplay: "anonymous",
      isDemo: true,
      autoReleaseEnabled: false,
      autoReleaseDays: 14,
    });
  });

  it("matches the email case-insensitively and ignores surrounding spaces", async () => {
    const res = await createOrg({
      name: "大量國小",
      orgAdminEmail: "  Admin@School.edu.tw ",
    });

    expect(res.status).toBe(201);
    expect(fakeDb.memberships[0].user_id).toBe(7);
  });

  it("rejects an email with no registered account and creates nothing", async () => {
    const res = await createOrg({
      name: "大量國小",
      orgAdminEmail: "nobody@school.edu.tw",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_REGISTERED");
    expect(fakeDb.organizations).toHaveLength(0);
    expect(fakeDb.memberships).toHaveLength(0);
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a name over 100 characters", { name: "x".repeat(101) }],
    ["a malformed email", { orgAdminEmail: "not-an-email" }],
    ["an unknown publisher display", { publisherDisplay: "unit_only" }],
    ["zero auto release days", { autoReleaseDays: 0 }],
    ["fractional auto release days", { autoReleaseDays: 1.5 }],
  ])("rejects %s as a form error", async (_label, override) => {
    const res = await createOrg({
      name: "大量國小",
      orgAdminEmail: "admin@school.edu.tw",
      ...override,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(fakeDb.organizations).toHaveLength(0);
  });
});

describe("GET /api/admin/orgs", () => {
  beforeEach(() => signInAs("admin"));

  it("lists orgs with their Org Admins", async () => {
    await createOrg({ name: "甲校", orgAdminEmail: "admin@school.edu.tw" });
    await createOrg({ name: "乙校", orgAdminEmail: "second@school.edu.tw" });

    const res = await request(makeApp()).get("/api/admin/orgs");

    expect(res.status).toBe(200);
    expect(res.body.orgs.map((o: { name: string }) => o.name).sort()).toEqual(
      ["乙校", "甲校"].sort(),
    );
    expect(
      res.body.orgs.find((o: { name: string }) => o.name === "乙校").orgAdmins,
    ).toEqual([{ email: "second@school.edu.tw" }]);
  });
});

describe("PATCH /api/admin/orgs/:id", () => {
  beforeEach(() => signInAs("admin"));

  it("updates only the fields sent", async () => {
    const created = await createOrg({
      name: "大量國小",
      isDemo: true,
      orgAdminEmail: "admin@school.edu.tw",
    });

    const res = await request(makeApp())
      .patch(`/api/admin/orgs/${created.body.org.id}`)
      .send({ publisherDisplay: "org_unit", autoReleaseDays: 45 });

    expect(res.status).toBe(200);
    expect(res.body.org).toMatchObject({
      name: "大量國小",
      isDemo: true,
      publisherDisplay: "org_unit",
      autoReleaseDays: 45,
      orgAdmins: [{ email: "admin@school.edu.tw" }],
    });
  });

  it("returns ORG_NOT_FOUND for an unknown org", async () => {
    const res = await request(makeApp())
      .patch(`/api/admin/orgs/${UNKNOWN_ORG_ID}`)
      .send({ name: "改名" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });

  it("treats a malformed org id as a client bug", async () => {
    const res = await request(makeApp())
      .patch("/api/admin/orgs/not-a-uuid")
      .send({ name: "改名" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("rejects an invalid setting as a form error", async () => {
    const created = await createOrg({
      name: "大量國小",
      orgAdminEmail: "admin@school.edu.tw",
    });

    const res = await request(makeApp())
      .patch(`/api/admin/orgs/${created.body.org.id}`)
      .send({ autoReleaseDays: -3 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });
});
