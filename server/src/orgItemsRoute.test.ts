/**
 * 組織物品上架與組織頁（#136，PRD 0001 §5.1 E2-1、E3、E4-1；ADR 0003、ADR 0005）
 *
 * 透過 HTTP 測 `/api/orgs`：
 * - Unit Contact 代表自己負責的單位上架 Share，Org Admin 可代表任一單位；上架後在 Internal
 * - 物品類別、預設重量與來源來自避免排放量係數表（factorTable），不另建 seed
 * - 組織頁只給該組織的成員看，依 access_level 決定看得到哪些層級；非成員一律 404 ORG_NOT_FOUND
 * - 後台清單：Unit Contact 只看自己單位，Org Admin 看全組織，可依單位、層級、狀態篩選
 * MySQL 換成記憶體裡的假資料表，佇列換成 jest.fn，斷言停在 HTTP 回應與送出的 job。
 */

import express from "express";
import request from "supertest";
import orgItemsRouter from "./orgItems";
import * as sessionModule from "./session";
import * as queues from "./queue/queues";
import { errorMiddleware } from "./utils/errorHandler";
import {
  createFakeOrgItemsDb,
  FakeOrgItemsDb,
} from "./testUtils/fakeOrgItemsDb";

let fakeDb: FakeOrgItemsDb;

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

jest.mock("./queue/queues", () => ({
  enqueuePostUploadImages: jest.fn().mockResolvedValue(undefined),
  enqueuePostEmbedding: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

//* 帳號
const ORG_ADMIN = 1;
const UNIT_CONTACT = 2;
const ORG_MEMBER = 3;
const OUTSIDER = 4;
const PLATFORM_ADMIN = 5;
const OTHER_ORG_CONTACT = 6;

//* 甲公司：Org Admin、總務部窗口、一般成員；乙公司：一位窗口
const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;
const OTHER_ORG_UNIT = 203;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/orgs", orgItemsRouter);
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

function signOut() {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue(null);
}

function api() {
  return request(makeApp());
}

const CHAIR = {
  unitId: GENERAL_AFFAIRS,
  title: "人體工學辦公椅",
  content: "會議室汰換，功能正常",
  orgCategory: "office_chair",
  quantity: 4,
  unitWeightKg: 13.8,
  conditionLevel: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  fakeDb = createFakeOrgItemsDb({
    users: [
      { id: ORG_ADMIN, email: "admin@corp.tw" },
      { id: UNIT_CONTACT, email: "contact@corp.tw" },
      { id: ORG_MEMBER, email: "staff@corp.tw" },
      { id: OUTSIDER, email: "someone@gmail.com" },
      { id: PLATFORM_ADMIN, email: "ops@megaweave.tw" },
      { id: OTHER_ORG_CONTACT, email: "contact@other.tw" },
    ],
    organizations: [
      {
        id: 10,
        public_id: ORG,
        name: "甲公司",
        publisher_display: "org",
        is_demo: false,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
      {
        id: 20,
        public_id: OTHER_ORG,
        name: "乙公司",
        publisher_display: "org",
        is_demo: false,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
    ],
    memberships: [
      { id: 101, org_id: 10, user_id: ORG_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 102, org_id: 10, user_id: UNIT_CONTACT, org_role: "member", access_level: "internal" },
      { id: 103, org_id: 10, user_id: ORG_MEMBER, org_role: "member", access_level: "member" },
      { id: 104, org_id: 20, user_id: OTHER_ORG_CONTACT, org_role: "member", access_level: "internal" },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: IT_DEPT, org_id: 10, name: "資訊部" },
      { id: OTHER_ORG_UNIT, org_id: 20, name: "乙公司總務" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 20, org_unit_id: OTHER_ORG_UNIT, membership_id: 104 },
    ],
  });
});

describe("GET /api/orgs/item-categories", () => {
  it("lists the 16 factor-table categories with default weights and their sources", async () => {
    signOut();
    const res = await api().get("/api/orgs/item-categories");

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(16);
    const chair = res.body.categories.find(
      (c: { id: string }) => c.id === "office_chair",
    );
    expect(chair).toMatchObject({
      name: "辦公椅",
      defaultWeightKg: 13.8,
      defaultWeightSource: {
        publisher: "Steelcase / NSF International",
        url: "https://info.nsf.org/Certified/Sustain/ProdCert/EPD10930.pdf",
      },
    });
    expect(res.body.factorTableVersion).toEqual(expect.any(String));
  });

  it("gives plastic goods no default weight, so the form must ask for one", async () => {
    const res = await api().get("/api/orgs/item-categories");
    const plastic = res.body.categories.find(
      (c: { id: string }) => c.id === "plastic_goods",
    );
    expect(plastic.defaultWeightKg).toBeNull();
    expect(plastic.defaultWeightSource).toBeNull();
  });
});

describe("GET /api/orgs", () => {
  it("lists the caller's orgs with what they can manage", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api().get("/api/orgs");

    expect(res.status).toBe(200);
    expect(res.body.orgs).toEqual([
      {
        id: ORG,
        name: "甲公司",
        accessLevel: "internal",
        isAdmin: false,
        manageableUnits: [{ id: GENERAL_AFFAIRS, name: "總務部" }],
      },
    ]);
  });

  it("lets an Org Admin manage every unit of the org", async () => {
    signInAs(ORG_ADMIN);
    const res = await api().get("/api/orgs");

    expect(res.body.orgs[0].isAdmin).toBe(true);
    expect(res.body.orgs[0].manageableUnits).toHaveLength(2);
    expect(res.body.orgs[0].manageableUnits).toEqual(
      expect.arrayContaining([
        { id: IT_DEPT, name: "資訊部" },
        { id: GENERAL_AFFAIRS, name: "總務部" },
      ]),
    );
  });

  it("is empty for someone outside every org, including a Platform Admin", async () => {
    signInAs(PLATFORM_ADMIN, "admin");
    const res = await api().get("/api/orgs");
    expect(res.status).toBe(200);
    expect(res.body.orgs).toEqual([]);
  });

  it("requires sign-in", async () => {
    signOut();
    const res = await api().get("/api/orgs");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orgs/:orgId/items", () => {
  it("lists a Share owned by the unit, Internal, with weight, quantity and optional asset data", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, assetNumber: "A-2024-0001", estimatedValueTwd: 3000 });

    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({
      title: "人體工學辦公椅",
      type: "share",
      audienceTier: "internal",
      unit: { id: GENERAL_AFFAIRS, name: "總務部" },
      orgCategory: "office_chair",
      quantity: 4,
      unitWeightKg: 13.8,
      weightIsDefault: true,
      assetNumber: "A-2024-0001",
      estimatedValueTwd: 3000,
    });

    //* 新貼文要進向量索引（scope 由 job 從 MySQL 讀），但不碰公開熱門排行
    expect(queues.enqueuePostEmbedding).toHaveBeenCalledTimes(1);
  });

  it("records an entered weight that differs from the category default", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, unitWeightKg: 18 });

    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ unitWeightKg: 18, weightIsDefault: false });
  });

  it("shows the new item on the org page for the org's Unit Contacts and Org Admins", async () => {
    signInAs(UNIT_CONTACT);
    await api().post(`/api/orgs/${ORG}/items`).send(CHAIR).expect(201);

    for (const viewer of [UNIT_CONTACT, ORG_ADMIN]) {
      signInAs(viewer);
      const res = await api().get(`/api/orgs/${ORG}/posts`);
      expect(res.status).toBe(200);
      expect(res.body.posts.map((p: { title: string }) => p.title)).toEqual([
        "人體工學辦公椅",
      ]);
    }
  });

  it("keeps the Internal item from Org Members, who only see the Members tier", async () => {
    signInAs(UNIT_CONTACT);
    await api().post(`/api/orgs/${ORG}/items`).send(CHAIR).expect(201);

    signInAs(ORG_MEMBER);
    const res = await api().get(`/api/orgs/${ORG}/posts`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });

  it("returns 404 ORG_NOT_FOUND on the org page to non-members and Platform Admins", async () => {
    for (const [viewer, role] of [
      [OUTSIDER, "user"],
      [OTHER_ORG_CONTACT, "user"],
      [PLATFORM_ADMIN, "admin"],
    ] as const) {
      signInAs(viewer, role);
      const res = await api().get(`/api/orgs/${ORG}/posts`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ORG_NOT_FOUND");
    }
  });

  it("lets an Org Admin list for any unit", async () => {
    signInAs(ORG_ADMIN);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, unitId: IT_DEPT });

    expect(res.status).toBe(201);
    expect(res.body.item.unit).toEqual({ id: IT_DEPT, name: "資訊部" });
  });

  it("refuses a unit the Unit Contact does not represent", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, unitId: IT_DEPT });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it("refuses an Org Member who is not a Unit Contact", async () => {
    signInAs(ORG_MEMBER);
    const res = await api().post(`/api/orgs/${ORG}/items`).send(CHAIR);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it("returns 404 ORG_NOT_FOUND to someone outside the org", async () => {
    signInAs(OTHER_ORG_CONTACT);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, unitId: OTHER_ORG_UNIT });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });

  it("requires a weight for a category without a default (plastic goods)", async () => {
    signInAs(UNIT_CONTACT);
    const { unitWeightKg: _omit, ...withoutWeight } = CHAIR;
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...withoutWeight, orgCategory: "plastic_goods" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a typed field out of range as VALIDATION_FAILED", async () => {
    signInAs(UNIT_CONTACT);
    for (const bad of [
      { quantity: 0 },
      { unitWeightKg: 0 },
      { title: "" },
      { estimatedValueTwd: -1 },
      { assetNumber: "x".repeat(101) },
    ]) {
      const res = await api()
        .post(`/api/orgs/${ORG}/items`)
        .send({ ...CHAIR, ...bad });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects an unknown category or a malformed unit id as INVALID_REQUEST", async () => {
    signInAs(UNIT_CONTACT);
    for (const bad of [{ orgCategory: "rocket" }, { unitId: "x" }]) {
      const res = await api()
        .post(`/api/orgs/${ORG}/items`)
        .send({ ...CHAIR, ...bad });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
    }
  });

  it("ignores any attempt to pick a post type, tier or payment: the item is always an Internal Share", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, type: "wish", audienceTier: "public" });

    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ type: "share", audienceTier: "internal" });
  });

  it("hands photo staging keys to the image upload queue", async () => {
    signInAs(UNIT_CONTACT);
    await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, stagingKeys: ["staging/posts/a.webp"] })
      .expect(201);

    expect(queues.enqueuePostUploadImages).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.objectContaining({ stagingKey: "staging/posts/a.webp" })],
      }),
    );
  });
});

describe("GET /api/orgs/:orgId/items (back office)", () => {
  beforeEach(async () => {
    signInAs(ORG_ADMIN);
    await api().post(`/api/orgs/${ORG}/items`).send(CHAIR).expect(201);
    await api()
      .post(`/api/orgs/${ORG}/items`)
      .send({ ...CHAIR, title: "27 吋螢幕", orgCategory: "display", unitWeightKg: 5, unitId: IT_DEPT })
      .expect(201);
  });

  function titles(res: request.Response): string[] {
    return res.body.items.map((i: { title: string }) => i.title).sort();
  }

  it("shows a Unit Contact only their own units' items", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}/items`);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(["人體工學辦公椅"]);
    expect(res.body.items[0]).toMatchObject({
      unit: { id: GENERAL_AFFAIRS, name: "總務部" },
      audienceTier: "internal",
      status: "active",
      quantity: 4,
      unitWeightKg: 13.8,
    });
  });

  it("shows an Org Admin the whole org, filterable by unit, tier and status", async () => {
    signInAs(ORG_ADMIN);
    expect(titles(await api().get(`/api/orgs/${ORG}/items`))).toEqual([
      "27 吋螢幕",
      "人體工學辦公椅",
    ]);
    expect(
      titles(await api().get(`/api/orgs/${ORG}/items?unitId=${IT_DEPT}`)),
    ).toEqual(["27 吋螢幕"]);
    expect(
      titles(await api().get(`/api/orgs/${ORG}/items?tier=internal&status=active`)),
    ).toEqual(["27 吋螢幕", "人體工學辦公椅"]);
    expect(titles(await api().get(`/api/orgs/${ORG}/items?tier=public`))).toEqual([]);
    expect(titles(await api().get(`/api/orgs/${ORG}/items?status=inactive`))).toEqual([]);
  });

  it("refuses a unit filter outside what the Unit Contact manages", async () => {
    signInAs(UNIT_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}/items?unitId=${IT_DEPT}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it("rejects malformed filters as INVALID_REQUEST", async () => {
    signInAs(ORG_ADMIN);
    for (const query of ["tier=secret", "status=gone", "unitId=abc"]) {
      const res = await api().get(`/api/orgs/${ORG}/items?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
    }
  });

  it("refuses an Org Member, who manages no unit", async () => {
    signInAs(ORG_MEMBER);
    const res = await api().get(`/api/orgs/${ORG}/items`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });
});
