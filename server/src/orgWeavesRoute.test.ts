/**
 * Internal 層的單位對單位認領（#137，PRD 0001 §5.1 E5-1、E9；ADR 0003、ADR 0004）
 *
 * 透過 HTTP 測 `/api/weaves` 與 `/api/orgs` 後台：
 * - 能認領 = 能看到：不符合目前層級的人送不出請求，回 404
 * - 申請人選「代表某單位」或「我個人」，Weave 記錄流向單位（receiver_org_unit_id）；
 *   只有一種身分的人沒有選項，個人 Weave 的流向單位為空
 * - 物品所屬單位的任一窗口或 Org Admin 可核可／婉拒；其他人不行
 * MySQL 換成記憶體裡的假資料表；通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import {
  createFakeOrgWeavesDb,
  FakeOrgWeavesDb,
} from "./testUtils/fakeOrgWeavesDb";

let fakeDb: FakeOrgWeavesDb;

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
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(undefined),
  enqueueSendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(true),
}));

//* 私訊不在這張票的範圍：沒有對話，就不寫系統訊息
jest.mock("./utils/messageService", () => ({
  messageService: { getConversationId: jest.fn().mockResolvedValue(null) },
}));

jest.mock("./utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";

//* 帳號
const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架物品的人
const IT_CONTACT = 3; //* 只負責資訊部
const ORG_MEMBER = 4;
const OUTSIDER = 5;
const MULTI_CONTACT = 6; //* 同時負責資訊部與法務部
const GA_CONTACT_2 = 7; //* 總務部的另一位窗口
const ADMIN_IT_CONTACT = 8; //* Org Admin 兼資訊部窗口
const PLATFORM_ADMIN = 9; //* 全站 role = admin，不是這個組織的成員

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;
const LEGAL = 203;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.io = { to: () => ({ emit: () => {} }) };
    next();
  });
  app.use("/api/orgs", orgItemsRouter);
  app.use("/api/weaves", weavesRouter);
  app.use(errorMiddleware);
  return app;
}

function signInAs(userId: number) {
  (sessionModule.getUserFromCookie as jest.Mock).mockResolvedValue({
    userId,
    role: "user",
    username: `user-${userId}`,
    email: `user${userId}@example.com`,
    public_id: `u-${userId}`,
    joined_at: new Date(),
  });
}

function api() {
  return request(makeApp());
}

const MONITOR = {
  unitId: GENERAL_AFFAIRS,
  title: "27 吋螢幕",
  content: "汰換下來，功能正常",
  orgCategory: "display",
  quantity: 3,
  unitWeightKg: 5,
  conditionLevel: 2,
};

/** 總務部窗口上架一件 Internal 物品，回傳 posts.id 與 items.id */
async function listInternalItem() {
  signInAs(GA_CONTACT);
  const res = await api().post(`/api/orgs/${ORG}/items`).send(MONITOR);
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  const item = fakeDb.items.find((i) => i.post_id === post.id)!;
  return { postId: post.id, publicId: post.public_id as string, itemId: item.id };
}

async function requestAs(
  userId: number,
  postId: number,
  extra: Record<string, unknown> = {},
) {
  signInAs(userId);
  return api()
    .post("/api/weaves")
    .send({ postId, items: [{ itemId: fakeDb.items.find((i) => i.post_id === postId)!.id, quantity: 1 }], ...extra });
}

function weaveRow(weaveId: number) {
  return fakeDb.weaves.find((w) => w.id === weaveId)!;
}

beforeEach(() => {
  jest.clearAllMocks();
  const userIds = [
    ORG_ADMIN,
    GA_CONTACT,
    IT_CONTACT,
    ORG_MEMBER,
    OUTSIDER,
    MULTI_CONTACT,
    GA_CONTACT_2,
    ADMIN_IT_CONTACT,
    PLATFORM_ADMIN,
  ];
  fakeDb = createFakeOrgWeavesDb({
    users: userIds.map((id) => ({
      id,
      email: `user${id}@example.com`,
      ...(id === PLATFORM_ADMIN ? { role: "admin" } : {}),
    })),
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
    ],
    memberships: [
      { id: 101, org_id: 10, user_id: ORG_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 102, org_id: 10, user_id: GA_CONTACT, org_role: "member", access_level: "internal" },
      { id: 103, org_id: 10, user_id: IT_CONTACT, org_role: "member", access_level: "internal" },
      { id: 104, org_id: 10, user_id: ORG_MEMBER, org_role: "member", access_level: "member" },
      { id: 106, org_id: 10, user_id: MULTI_CONTACT, org_role: "member", access_level: "internal" },
      { id: 107, org_id: 10, user_id: GA_CONTACT_2, org_role: "member", access_level: "internal" },
      { id: 108, org_id: 10, user_id: ADMIN_IT_CONTACT, org_role: "admin", access_level: "internal" },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: IT_DEPT, org_id: 10, name: "資訊部" },
      { id: LEGAL, org_id: 10, name: "法務部" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 103 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 106 },
      { org_id: 10, org_unit_id: LEGAL, membership_id: 106 },
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 107 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 108 },
    ],
  });
});

describe("POST /api/weaves on an Internal org item: who may request", () => {
  it.each([
    ["an Org Member", ORG_MEMBER],
    ["someone outside the org", OUTSIDER],
  ])("returns 404 POST_NOT_FOUND to %s and writes nothing", async (_who, userId) => {
    const { postId } = await listInternalItem();
    const res = await requestAs(userId, postId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
    expect(fakeDb.weaves).toHaveLength(0);
  });

  it("lets a Unit Contact of another unit request it on behalf of their unit", async () => {
    const { postId } = await listInternalItem();
    const res = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    expect(res.status).toBe(201);
    expect(weaveRow(res.body.weaveId)).toMatchObject({
      post_id: postId,
      giver_id: GA_CONTACT,
      receiver_id: IT_CONTACT,
      receiver_org_unit_id: IT_DEPT,
      status: "requested",
    });
  });
});

describe("POST /api/weaves on an org item: items and quantities", () => {
  //* 組織物品要記下品項與數量、交接時扣庫存，不接受「整篇貼文」申請
  it.each([
    ["the whole post", { items: [{ itemId: null, quantity: 1 }] }],
    ["no items at all", { items: [] }],
  ])("rejects a request for %s with 400 INVALID_REQUEST and writes nothing", async (_what, body) => {
    const { postId } = await listInternalItem();
    signInAs(IT_CONTACT);
    const res = await api()
      .post("/api/weaves")
      .send({ postId, ...body, actingUnitId: IT_DEPT });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.weaves).toHaveLength(0);
  });

  it("takes the handed-over pieces out of the item's stock", async () => {
    const { postId, itemId } = await listInternalItem();
    signInAs(IT_CONTACT);
    const res = await api()
      .post("/api/weaves")
      .send({ postId, items: [{ itemId, quantity: 2 }], actingUnitId: IT_DEPT });
    expect(res.status).toBe(201);
    const weaveId = res.body.weaveId as number;

    for (const [userId, status] of [
      [GA_CONTACT, "approved"],
      [GA_CONTACT, "completed"],
      [IT_CONTACT, "completed"],
    ] as const) {
      signInAs(userId);
      const step = await api().patch(`/api/weaves/${weaveId}/status`).send({ status });
      expect(step.status).toBe(200);
    }

    expect(weaveRow(weaveId).status).toBe("completed");
    expect(fakeDb.items.find((i) => i.id === itemId)!.quantity).toBe(MONITOR.quantity - 2);
    expect(fakeDb.items.find((i) => i.id === itemId)!.reserved_quantity).toBe(0);
  });

  //* 核准即預留：兩筆申請搶同一批庫存時，後核准的那筆會被擋下，直到前一筆取消
  it("reserves stock on approval, so a second approval can't take the same pieces", async () => {
    const { postId, itemId } = await listInternalItem();
    const ask = async (userId: number) => {
      signInAs(userId);
      const res = await api()
        .post("/api/weaves")
        .send({ postId, items: [{ itemId, quantity: 2 }], actingUnitId: IT_DEPT });
      expect(res.status).toBe(201);
      return res.body.weaveId as number;
    };
    const setStatus = (userId: number, weaveId: number, status: string) => {
      signInAs(userId);
      return api().patch(`/api/weaves/${weaveId}/status`).send({ status });
    };
    const first = await ask(IT_CONTACT);
    const second = await ask(ADMIN_IT_CONTACT);
    const item = () => fakeDb.items.find((i) => i.id === itemId)!;

    expect((await setStatus(GA_CONTACT, first, "approved")).status).toBe(200);
    expect(item().reserved_quantity).toBe(2);

    const blocked = await setStatus(GA_CONTACT, second, "approved");
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe("INSUFFICIENT_STOCK");
    expect(blocked.body.params).toMatchObject({ available: MONITOR.quantity - 2 });
    expect(weaveRow(second).status).toBe("requested");

    expect((await setStatus(IT_CONTACT, first, "cancelled")).status).toBe(200);
    expect(item().reserved_quantity).toBe(0);
    expect((await setStatus(GA_CONTACT, second, "approved")).status).toBe(200);
    expect(item().reserved_quantity).toBe(2);
    expect(item().quantity).toBe(MONITOR.quantity);
  });
});

describe("POST /api/weaves on an org item: who hears about a new request", () => {
  it("notifies every contact of the owning unit and every Org Admin, but not the requester", async () => {
    const { postId } = await listInternalItem();
    const { createNotification } = jest.requireMock("./utils/notificationService");
    (createNotification as jest.Mock).mockClear();

    const res = await requestAs(ADMIN_IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    expect(res.status).toBe(201);
    const recipients = (createNotification as jest.Mock).mock.calls
      .filter(([, n]) => n.type === "WEAVE_REQUESTED")
      .map(([, n]) => n.recipient_id)
      .sort();
    //* 總務部的兩位窗口（含經手人）與另一位 Org Admin；申請人自己（Org Admin 兼資訊部窗口）不收
    expect(recipients).toEqual([ORG_ADMIN, GA_CONTACT, GA_CONTACT_2].sort());
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: GA_CONTACT_2,
        type: "WEAVE_REQUESTED",
        //* 不是 Weave 一方的審核者到組織物品管理頁核可
        link: "/org/items",
      }),
    );
  });
});

describe("POST /api/weaves: who the request is on behalf of", () => {
  it("records a personal request with no receiving unit", async () => {
    const { postId } = await listInternalItem();
    const res = await requestAs(IT_CONTACT, postId, { actingUnitId: null });

    expect(res.status).toBe(201);
    expect(weaveRow(res.body.weaveId).receiver_org_unit_id).toBeNull();
  });

  it("lets a contact of several units pick any of them", async () => {
    const { postId } = await listInternalItem();
    const res = await requestAs(MULTI_CONTACT, postId, { actingUnitId: LEGAL });

    expect(res.status).toBe(201);
    expect(weaveRow(res.body.weaveId).receiver_org_unit_id).toBe(LEGAL);
  });

  it("needs no choice from someone with one identity, and records them personally", async () => {
    const { postId } = await listInternalItem();
    //* Org Admin 沒有負責任何單位：只有「我個人」一種身分
    const res = await requestAs(ORG_ADMIN, postId);

    expect(res.status).toBe(201);
    expect(weaveRow(res.body.weaveId).receiver_org_unit_id).toBeNull();
  });

  it("rejects a request that skips the choice when there is one", async () => {
    const { postId } = await listInternalItem();
    const res = await requestAs(IT_CONTACT, postId);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.weaves).toHaveLength(0);
  });

  it.each([
    ["a unit they are not a contact of", IT_CONTACT, LEGAL],
    ["the unit that owns the item", GA_CONTACT_2, GENERAL_AFFAIRS],
    ["any unit, without being a contact", ORG_ADMIN, IT_DEPT],
  ])("rejects acting for %s", async (_what, userId, unitId) => {
    const { postId } = await listInternalItem();
    const res = await requestAs(userId, postId, { actingUnitId: unitId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.weaves).toHaveLength(0);
  });

  it("rejects a malformed acting unit", async () => {
    const { postId } = await listInternalItem();
    const res = await requestAs(IT_CONTACT, postId, { actingUnitId: "IT" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});

describe("GET /api/weaves/acting-units", () => {
  it("lists the units a contact can request on behalf of, without the owning unit", async () => {
    const { postId } = await listInternalItem();
    signInAs(MULTI_CONTACT);
    const res = await api().get(`/api/weaves/acting-units?postId=${postId}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([
      { id: LEGAL, name: "法務部" },
      { id: IT_DEPT, name: "資訊部" },
    ]);
  });

  it("is empty for someone with one identity, so the client shows no choice", async () => {
    const { postId } = await listInternalItem();
    signInAs(GA_CONTACT_2);
    const res = await api().get(`/api/weaves/acting-units?postId=${postId}`);

    expect(res.status).toBe(200);
    expect(res.body.units).toEqual([]);
  });

  it("returns 404 POST_NOT_FOUND for an item outside the caller's tier", async () => {
    const { postId } = await listInternalItem();
    signInAs(ORG_MEMBER);
    const res = await api().get(`/api/weaves/acting-units?postId=${postId}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
  });

  it("rejects a missing post id", async () => {
    signInAs(IT_CONTACT);
    const res = await api().get("/api/weaves/acting-units");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});

describe("PATCH /api/weaves/:id/status: who may review an org request", () => {
  async function pendingRequest() {
    const { postId } = await listInternalItem();
    const res = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    expect(res.status).toBe(201);
    return res.body.weaveId as number;
  }

  async function setStatus(userId: number, weaveId: number, status: string) {
    signInAs(userId);
    return api().patch(`/api/weaves/${weaveId}/status`).send({ status });
  }

  it.each([
    ["the contact who listed it", GA_CONTACT],
    ["another contact of the owning unit", GA_CONTACT_2],
    ["an Org Admin", ORG_ADMIN],
    ["a Platform Admin who is not a member (ADR 0003)", PLATFORM_ADMIN],
  ])("lets %s approve", async (_who, userId) => {
    const weaveId = await pendingRequest();
    const res = await setStatus(userId, weaveId, "approved");

    expect(res.status).toBe(200);
    expect(weaveRow(weaveId).status).toBe("approved");
  });

  it("lets another contact of the owning unit decline", async () => {
    const weaveId = await pendingRequest();
    const res = await setStatus(GA_CONTACT_2, weaveId, "declined");

    expect(res.status).toBe(200);
    expect(weaveRow(weaveId).status).toBe("declined");
  });

  it("tells the requester, not the lister, when someone else approves", async () => {
    const { createNotification } = jest.requireMock("./utils/notificationService");
    const weaveId = await pendingRequest();
    (createNotification as jest.Mock).mockClear();

    await setStatus(GA_CONTACT_2, weaveId, "approved");

    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipient_id: IT_CONTACT, type: "WEAVE_APPROVED" }),
    );
  });

  it.each([
    ["a contact of another unit", MULTI_CONTACT],
    ["an Org Member", ORG_MEMBER],
    ["someone outside the org", OUTSIDER],
  ])("refuses %s with 403", async (_who, userId) => {
    const weaveId = await pendingRequest();
    const res = await setStatus(userId, weaveId, "approved");

    expect(res.status).toBe(403);
    expect(weaveRow(weaveId).status).toBe("requested");
  });

  it("refuses the lister once they are no longer a contact of the unit", async () => {
    const weaveId = await pendingRequest();
    fakeDb.unitContacts = fakeDb.unitContacts.filter((c) => c.membership_id !== 102);

    const res = await setStatus(GA_CONTACT, weaveId, "approved");

    expect(res.status).toBe(403);
    expect(weaveRow(weaveId).status).toBe("requested");
  });

  it("does not let an Org Admin approve their own request", async () => {
    const { postId } = await listInternalItem();
    const created = await requestAs(ADMIN_IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    expect(created.status).toBe(201);

    const res = await setStatus(ADMIN_IT_CONTACT, created.body.weaveId, "approved");

    expect(res.status).toBe(403);
    expect(weaveRow(created.body.weaveId).status).toBe("requested");
  });

  it("lets the requester withdraw, but not a reviewer who is not a party", async () => {
    const weaveId = await pendingRequest();

    expect((await setStatus(GA_CONTACT_2, weaveId, "withdrawn")).status).toBe(403);
    expect((await setStatus(IT_CONTACT, weaveId, "withdrawn")).status).toBe(200);
    expect(weaveRow(weaveId).status).toBe("withdrawn");
  });

  it("keeps the hand-over to the two parties after approval", async () => {
    const weaveId = await pendingRequest();
    await setStatus(GA_CONTACT_2, weaveId, "approved");

    //* 核可的人不是 Giver：交接確認與取消仍只屬於兩造（換人經手在交接 ticket #142）
    expect((await setStatus(GA_CONTACT_2, weaveId, "completed")).status).toBe(403);
    expect((await setStatus(ORG_ADMIN, weaveId, "cancelled")).status).toBe(403);
    expect(weaveRow(weaveId)).toMatchObject({ status: "approved", giver_confirmed: 0 });
  });
});

describe("GET /api/weaves/:id: the receiving unit", () => {
  it("shows the unit the item flows to alongside the person handling it", async () => {
    const { postId } = await listInternalItem();
    const created = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    signInAs(GA_CONTACT);
    const res = await api().get(`/api/weaves/${created.body.weaveId}`);

    expect(res.status).toBe(200);
    expect(res.body.weave).toMatchObject({
      receiver_id: IT_CONTACT,
      receiver_org_unit: { id: IT_DEPT, name: "資訊部" },
    });
  });

  it("has no receiving unit for a personal request", async () => {
    const { postId } = await listInternalItem();
    const created = await requestAs(IT_CONTACT, postId, { actingUnitId: null });

    signInAs(IT_CONTACT);
    const res = await api().get(`/api/weaves/${created.body.weaveId}`);

    expect(res.status).toBe(200);
    expect(res.body.weave.receiver_org_unit).toBeNull();
  });
});

describe("back office: requests on the unit's items", () => {
  it("lists an item's requests with who handles them and the receiving unit", async () => {
    const { postId, publicId } = await listInternalItem();
    await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await requestAs(ORG_ADMIN, postId);

    signInAs(GA_CONTACT_2);
    const res = await api().get(`/api/orgs/${ORG}/items/${publicId}/requests`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toEqual([
      expect.objectContaining({
        status: "requested",
        quantity: 1,
        receiver: { name: `user-${ORG_ADMIN}` },
        receiverUnit: null,
      }),
      expect.objectContaining({
        status: "requested",
        quantity: 1,
        receiver: { name: `user-${IT_CONTACT}` },
        receiverUnit: { id: IT_DEPT, name: "資訊部" },
      }),
    ]);
    expect(res.body.requests[0].id).toEqual(expect.any(Number));
  });

  it.each([
    ["a contact of another unit", IT_CONTACT],
    ["an Org Member", ORG_MEMBER],
  ])("refuses %s with 403 ORG_UNIT_NOT_MANAGED", async (_who, userId) => {
    const { publicId } = await listInternalItem();
    signInAs(userId);
    const res = await api().get(`/api/orgs/${ORG}/items/${publicId}/requests`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it("returns 404 for an item that is not in the org", async () => {
    signInAs(ORG_ADMIN);
    const res = await api().get(
      `/api/orgs/${ORG}/items/33333333-3333-4333-8333-333333333333/requests`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
  });

  it("filters the item list to items waiting for review and counts their requests", async () => {
    const waiting = await listInternalItem();
    await listInternalItem();
    await requestAs(IT_CONTACT, waiting.postId, { actingUnitId: IT_DEPT });
    await requestAs(ORG_ADMIN, waiting.postId);

    signInAs(GA_CONTACT);
    const all = await api().get(`/api/orgs/${ORG}/items`);
    const pending = await api().get(`/api/orgs/${ORG}/items?weaveStatus=requested`);

    expect(all.body.items).toHaveLength(2);
    expect(pending.status).toBe(200);
    expect(pending.body.items).toEqual([
      expect.objectContaining({ id: waiting.publicId, pendingRequestCount: 2 }),
    ]);
  });

  it("rejects an unknown weave status filter", async () => {
    signInAs(GA_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}/items?weaveStatus=lost`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});
