/**
 * 組織管理員後台：管理單位與成員（#135，PRD 0001 §5.1、ADR 0003）
 *
 * 透過 HTTP 測 `/api/org-admin`：只有該組織的 Org Admin（`org_memberships.org_role = 'admin'`）能進入；
 * 成員只能用已註冊帳號的 email 加入，可指定為 Org Admin、某幾個單位的 Unit Contact 或 Org Member。
 * MySQL 換成記憶體裡的假資料表（只認得 service 用到的語句），斷言停在 HTTP 回應。
 */

import express from "express";
import request from "supertest";
import orgAdminRouter from "./orgAdmin";
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

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_ORG = "123e4567-e89b-42d3-a456-426614174000";

//* 帳號
const ORG_ADMIN = 1;
const UNIT_CONTACT = 2;
const ORG_MEMBER = 3;
const OTHER_ORG_ADMIN = 4;
const PLATFORM_ADMIN = 5;
const OUTSIDER = 6;

//* 甲校：Org Admin、總務處窗口、一般成員；乙校：另一位 Org Admin
const ADMIN_MEMBERSHIP = 101;
const CONTACT_MEMBERSHIP = 102;
const MEMBER_MEMBERSHIP = 103;
const GENERAL_AFFAIRS = 201;
const LIBRARY = 202;
const OTHER_ORG_UNIT = 203;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/org-admin", orgAdminRouter);
  app.use(errorMiddleware);
  return app;
}

function signInAs(userId: number, role: "admin" | "user" = "user") {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue({
    userId,
    role,
    username: `user-${userId}`,
    email: `user${userId}@example.com`,
    public_id: `u-${userId}`,
    joined_at: new Date(),
  });
}

function api() {
  return request(makeApp());
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeDb = createFakeOrgDb({
    users: [
      { id: ORG_ADMIN, email: "admin@school.edu.tw" },
      { id: UNIT_CONTACT, email: "contact@school.edu.tw" },
      { id: ORG_MEMBER, email: "student@school.edu.tw" },
      { id: OTHER_ORG_ADMIN, email: "admin@other.edu.tw" },
      { id: PLATFORM_ADMIN, email: "ops@megaweave.tw" },
      { id: OUTSIDER, email: "new@school.edu.tw" },
    ],
    organizations: [
      {
        id: 10,
        public_id: ORG,
        name: "甲校",
        publisher_display: "org",
        is_demo: false,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
      {
        id: 20,
        public_id: OTHER_ORG,
        name: "乙校",
        publisher_display: "org",
        is_demo: false,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
    ],
    memberships: [
      {
        id: ADMIN_MEMBERSHIP,
        org_id: 10,
        user_id: ORG_ADMIN,
        org_role: "admin",
        access_level: "internal",
      },
      {
        id: CONTACT_MEMBERSHIP,
        org_id: 10,
        user_id: UNIT_CONTACT,
        org_role: "staff",
        access_level: "internal",
      },
      {
        id: MEMBER_MEMBERSHIP,
        org_id: 10,
        user_id: ORG_MEMBER,
        org_role: "member",
        access_level: "member",
      },
      {
        id: 104,
        org_id: 20,
        user_id: OTHER_ORG_ADMIN,
        org_role: "admin",
        access_level: "internal",
      },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務處" },
      { id: LIBRARY, org_id: 10, name: "圖書館" },
      { id: OTHER_ORG_UNIT, org_id: 20, name: "乙校總務處" },
    ],
    unitContacts: [
      {
        org_id: 10,
        org_unit_id: GENERAL_AFFAIRS,
        membership_id: CONTACT_MEMBERSHIP,
      },
    ],
  });
});

describe("who can enter the Org Admin back office", () => {
  it("shows an Org Admin their org's units and members", async () => {
    signInAs(ORG_ADMIN);

    const res = await api().get(`/api/org-admin/orgs/${ORG}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      org: { id: ORG, name: "甲校" },
      units: [
        { id: GENERAL_AFFAIRS, name: "總務處" },
        { id: LIBRARY, name: "圖書館" },
      ],
      members: [
        {
          id: ADMIN_MEMBERSHIP,
          email: "admin@school.edu.tw",
          role: "admin",
          unitIds: [],
        },
        {
          id: CONTACT_MEMBERSHIP,
          email: "contact@school.edu.tw",
          role: "unit_contact",
          unitIds: [GENERAL_AFFAIRS],
        },
        {
          id: MEMBER_MEMBERSHIP,
          email: "student@school.edu.tw",
          role: "member",
          unitIds: [],
        },
      ],
    });
  });

  it("lists only the orgs the signed-in user is an Org Admin of", async () => {
    signInAs(ORG_ADMIN);

    const res = await api().get("/api/org-admin/orgs");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ orgs: [{ id: ORG, name: "甲校" }] });
  });

  it.each([
    ["a Unit Contact", UNIT_CONTACT, "user"],
    ["an Org Member", ORG_MEMBER, "user"],
    ["another org's Org Admin", OTHER_ORG_ADMIN, "user"],
    ["a Platform Admin who is not an Org Admin", PLATFORM_ADMIN, "admin"],
    ["a non-member", OUTSIDER, "user"],
  ] as const)(
    "%s cannot see or change the org, and learns nothing about it",
    async (_label, userId, role) => {
      signInAs(userId, role);

      //* 依序送出，避免同時開多個 supertest server
      const app = makeApp();
      const responses = [
        await request(app).get(`/api/org-admin/orgs/${ORG}`),
        await request(app)
          .post(`/api/org-admin/orgs/${ORG}/units`)
          .send({ name: "新單位" }),
        await request(app)
          .post(`/api/org-admin/orgs/${ORG}/members`)
          .send({ email: "new@school.edu.tw", role: "member" }),
        await request(app).delete(
          `/api/org-admin/orgs/${ORG}/members/${MEMBER_MEMBERSHIP}`,
        ),
      ];

      for (const res of responses) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("ORG_NOT_FOUND");
      }
      expect(fakeDb.units).toHaveLength(3);
      expect(fakeDb.memberships).toHaveLength(4);
    },
  );

  it("answers an unknown org the same way as one the user doesn't admin", async () => {
    signInAs(ORG_ADMIN);

    const res = await api().get(`/api/org-admin/orgs/${UNKNOWN_ORG}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });

  it("treats a malformed org id as a client bug", async () => {
    signInAs(ORG_ADMIN);

    const res = await api().get("/api/org-admin/orgs/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("turns away a signed-out visitor", async () => {
    (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue(null);

    const res = await api().get("/api/org-admin/orgs");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/org-admin/orgs/:orgId/units", () => {
  beforeEach(() => signInAs(ORG_ADMIN));

  it("creates a unit the org's overview then lists", async () => {
    const res = await api()
      .post(`/api/org-admin/orgs/${ORG}/units`)
      .send({ name: "  資訊室 " });

    expect(res.status).toBe(201);
    expect(res.body.unit).toEqual({ id: expect.any(Number), name: "資訊室" });
    const overview = await api().get(`/api/org-admin/orgs/${ORG}`);
    expect(overview.body.units).toContainEqual(res.body.unit);
  });

  it("rejects a unit name the org already uses", async () => {
    const res = await api()
      .post(`/api/org-admin/orgs/${ORG}/units`)
      .send({ name: "總務處" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DUPLICATE_ENTRY");
  });

  it("lets another org reuse the same unit name", async () => {
    signInAs(OTHER_ORG_ADMIN);

    const res = await api()
      .post(`/api/org-admin/orgs/${OTHER_ORG}/units`)
      .send({ name: "總務處" });

    expect(res.status).toBe(201);
  });

  it.each([
    ["an empty name", { name: "  " }],
    ["a name over 100 characters", { name: "x".repeat(101) }],
    ["no name", {}],
  ])("rejects %s as a form error", async (_label, body) => {
    const res = await api().post(`/api/org-admin/orgs/${ORG}/units`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(fakeDb.units).toHaveLength(3);
  });
});

describe("POST /api/org-admin/orgs/:orgId/members", () => {
  beforeEach(() => signInAs(ORG_ADMIN));

  function addMember(body: Record<string, unknown>) {
    return api().post(`/api/org-admin/orgs/${ORG}/members`).send(body);
  }

  async function overviewMember(email: string) {
    const res = await api().get(`/api/org-admin/orgs/${ORG}`);
    return res.body.members.find((m: { email: string }) => m.email === email);
  }

  it("adds a registered account as an Org Member", async () => {
    const res = await addMember({ email: "new@school.edu.tw", role: "member" });

    expect(res.status).toBe(201);
    expect(res.body.member).toEqual({
      id: expect.any(Number),
      email: "new@school.edu.tw",
      role: "member",
      unitIds: [],
    });
    expect(await overviewMember("new@school.edu.tw")).toEqual(res.body.member);
  });

  it("makes one person the Unit Contact of several units", async () => {
    const res = await addMember({
      email: "new@school.edu.tw",
      role: "unit_contact",
      unitIds: [LIBRARY, GENERAL_AFFAIRS],
    });

    expect(res.status).toBe(201);
    expect(await overviewMember("new@school.edu.tw")).toEqual({
      id: res.body.member.id,
      email: "new@school.edu.tw",
      role: "unit_contact",
      unitIds: [GENERAL_AFFAIRS, LIBRARY],
    });
  });

  it("adds another Org Admin, who can then run the back office", async () => {
    const res = await addMember({ email: "new@school.edu.tw", role: "admin" });
    expect(res.status).toBe(201);

    signInAs(OUTSIDER);
    const overview = await api().get(`/api/org-admin/orgs/${ORG}`);

    expect(overview.status).toBe(200);
    expect(
      overview.body.members
        .filter((m: { role: string }) => m.role === "admin")
        .map((m: { email: string }) => m.email),
    ).toEqual(["admin@school.edu.tw", "new@school.edu.tw"]);
  });

  it("matches the email case-insensitively and ignores surrounding spaces", async () => {
    const res = await addMember({
      email: "  New@School.edu.tw ",
      role: "member",
    });

    expect(res.status).toBe(201);
    expect(
      fakeDb.memberships.find((m) => m.id === res.body.member.id)?.user_id,
    ).toBe(OUTSIDER);
  });

  it("rejects an email with no registered account", async () => {
    const res = await addMember({
      email: "nobody@school.edu.tw",
      role: "unit_contact",
      unitIds: [LIBRARY],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_REGISTERED");
    expect(fakeDb.memberships).toHaveLength(4);
    expect(fakeDb.unitContacts).toHaveLength(1);
  });

  it("rejects someone who is already a member", async () => {
    const res = await addMember({
      email: "student@school.edu.tw",
      role: "admin",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DUPLICATE_ENTRY");
    expect(
      fakeDb.memberships.find((m) => m.id === MEMBER_MEMBERSHIP)?.org_role,
    ).toBe("member");
  });

  it("asks for at least one unit when adding a Unit Contact", async () => {
    const res = await addMember({
      email: "new@school.edu.tw",
      role: "unit_contact",
      unitIds: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNIT_CONTACT_NEEDS_UNIT");
    expect(fakeDb.memberships).toHaveLength(4);
  });

  it.each([
    ["a malformed email", { email: "not-an-email", role: "member" }],
    ["an unknown role", { email: "new@school.edu.tw", role: "owner" }],
    ["no email", { role: "member" }],
  ])("rejects %s as a form error", async (_label, body) => {
    const res = await addMember(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(fakeDb.memberships).toHaveLength(4);
  });

  it.each([
    [
      "a unit from another org",
      { role: "unit_contact", unitIds: [GENERAL_AFFAIRS, OTHER_ORG_UNIT] },
    ],
    ["a unit that does not exist", { role: "unit_contact", unitIds: [999] }],
    ["malformed unit ids", { role: "unit_contact", unitIds: ["總務處"] }],
    ["units on a non-Unit-Contact", { role: "member", unitIds: [LIBRARY] }],
  ])("treats %s as a client bug and adds no one", async (_label, body) => {
    const res = await addMember({ email: "new@school.edu.tw", ...body });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.memberships).toHaveLength(4);
    expect(fakeDb.unitContacts).toHaveLength(1);
  });
});

describe("DELETE /api/org-admin/orgs/:orgId/members/:memberId", () => {
  beforeEach(() => signInAs(ORG_ADMIN));

  function removeMember(memberId: number | string, org = ORG) {
    return api().delete(`/api/org-admin/orgs/${org}/members/${memberId}`);
  }

  it("removes the membership and its Unit Contact assignments, keeping the account", async () => {
    const res = await removeMember(CONTACT_MEMBERSHIP);

    expect(res.status).toBe(204);
    const overview = await api().get(`/api/org-admin/orgs/${ORG}`);
    expect(overview.body.members.map((m: { id: number }) => m.id)).toEqual([
      ADMIN_MEMBERSHIP,
      MEMBER_MEMBERSHIP,
    ]);
    expect(fakeDb.unitContacts).toEqual([]);
    expect(fakeDb.users.some((u) => u.id === UNIT_CONTACT)).toBe(true);
    expect(overview.body.units).toHaveLength(2);
  });

  it("revokes a removed Org Admin's access to the back office", async () => {
    await api()
      .post(`/api/org-admin/orgs/${ORG}/members`)
      .send({ email: "new@school.edu.tw", role: "admin" });
    const newAdmin = fakeDb.memberships.find((m) => m.user_id === OUTSIDER)!;

    const res = await removeMember(newAdmin.id);
    expect(res.status).toBe(204);

    signInAs(OUTSIDER);
    const overview = await api().get(`/api/org-admin/orgs/${ORG}`);
    expect(overview.status).toBe(404);
  });

  it("keeps the last Org Admin", async () => {
    const res = await removeMember(ADMIN_MEMBERSHIP);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORG_LAST_ADMIN");
    expect(fakeDb.memberships).toHaveLength(4);
  });

  it("does not reach a membership of another org", async () => {
    const res = await removeMember(104);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_MEMBER_NOT_FOUND");
    expect(fakeDb.memberships).toHaveLength(4);
  });

  it("treats a malformed member id as a client bug", async () => {
    const res = await removeMember("abc");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});
