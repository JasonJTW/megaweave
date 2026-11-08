/**
 * 物品流轉時間軸與閒置清單（#141，PRD 0001 §5.1 E9-1、E9-3；ADR 0003、ADR 0004）
 *
 * 透過 HTTP 測 `GET /api/orgs/:orgId/items/:itemId/timeline` 與後台清單的去向，
 * 搭配 `/api/orgs`（上架、升降級）、`/api/weaves`（申請、核可、交接）與 `/api/org-admin`（移除成員、交接）：
 * - 時間軸從上架到交接完成的每一步，都有操作者與時間；窗口異動後仍保留原操作者
 * - 只有能管這個單位的窗口與 Org Admin 看得到；沒有任何修改或刪除紀錄的路由
 * - 後台清單附上每件物品的去向（領取的單位或個人），可依單位篩選
 * MySQL 換成記憶體裡的假資料表；向量索引、通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import request from "supertest";
import orgAdminRouter from "./orgAdmin";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { createFakeOrgTimelineDb, FakeOrgTimelineDb } from "./testUtils/fakeOrgTimelineDb";

let fakeDb: FakeOrgTimelineDb;

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => fakeDb.connection.query(...args),
    execute: (...args: unknown[]) => fakeDb.connection.execute(...args),
    getConnection: () => Promise.resolve(fakeDb.connection),
  },
}));

jest.mock("./utils/redis", () => ({
  getVectorRedisClient: () => ({ exists: async () => 1, hSet: async () => 1 }),
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

jest.mock("./utils/messageService", () => ({
  messageService: {
    getConversationId: jest.fn(
      async (a: number, b: number) => Math.min(a, b) * 1000 + Math.max(a, b),
    ),
    createMessage: jest.fn().mockRejectedValue(new Error("not under test")),
  },
}));

jest.mock("./utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";

//* 帳號（假資料的顯示名稱是 user-<id>）
const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架物品的人（之後離職）
const IT_CONTACT = 3; //* 資訊部窗口，代表資訊部申請
const ORG_MEMBER = 4;
const GA_CONTACT_2 = 7; //* 總務部的另一位窗口，接手的人

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.io = { to: () => ({ emit: () => {} }) };
    next();
  });
  app.use("/api/org-admin", orgAdminRouter);
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
  quantity: 5,
  unitWeightKg: 5,
  conditionLevel: 2,
  assetNumber: "A-0001",
};

/** 由 userId 上架一件 Internal 物品，回傳 public id 與 posts.id */
async function listItem(userId = GA_CONTACT, unitId = GENERAL_AFFAIRS) {
  signInAs(userId);
  const res = await api()
    .post(`/api/orgs/${ORG}/items`)
    .send({ ...MONITOR, unitId });
  expect(res.status).toBe(201);
  const itemId = res.body.item.id as string;
  return { itemId, postId: fakeDb.posts.find((p) => p.public_id === itemId)!.id };
}

async function timelineAs(userId: number, itemId: string) {
  signInAs(userId);
  return api().get(`/api/orgs/${ORG}/items/${itemId}/timeline`);
}

beforeEach(() => {
  jest.clearAllMocks();
  const userIds = [ORG_ADMIN, GA_CONTACT, IT_CONTACT, ORG_MEMBER, GA_CONTACT_2];
  fakeDb = createFakeOrgTimelineDb({
    users: userIds.map((id) => ({ id, email: `user${id}@example.com` })),
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
      { id: 107, org_id: 10, user_id: GA_CONTACT_2, org_role: "member", access_level: "internal" },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: IT_DEPT, org_id: 10, name: "資訊部" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 103 },
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 107 },
    ],
  });
});

describe("GET /api/orgs/:orgId/items/:itemId/timeline", () => {
  it("starts with the listing: the owning unit, the asset number, who listed it and when", async () => {
    const { itemId } = await listItem();

    const res = await timelineAs(ORG_ADMIN, itemId);

    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual([
      {
        kind: "listed",
        at: expect.any(String),
        actor: { type: "user", name: "user-2" },
        unit: { id: GENERAL_AFFAIRS, name: "總務部" },
        assetNumber: "A-0001",
      },
    ]);
  });
});

describe("GET /api/orgs/:orgId/items/:itemId/timeline: who can see it", () => {
  it("is for the unit's contacts and the Org Admin, not other units' contacts or Org Members", async () => {
    const { itemId } = await listItem();

    expect((await timelineAs(GA_CONTACT_2, itemId)).status).toBe(200);
    const otherUnit = await timelineAs(IT_CONTACT, itemId);
    expect(otherUnit.status).toBe(403);
    expect(otherUnit.body.code).toBe("ORG_UNIT_NOT_MANAGED");
    const member = await timelineAs(ORG_MEMBER, itemId);
    expect(member.status).toBe(403);
    expect(member.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it("has no route that edits or deletes the records", async () => {
    const { itemId } = await listItem();
    signInAs(ORG_ADMIN);
    const url = `/api/orgs/${ORG}/items/${itemId}/timeline`;

    expect((await api().patch(url).send({})).status).toBe(404);
    expect((await api().put(url).send({})).status).toBe(404);
    expect((await api().delete(url)).status).toBe(404);
    expect((await timelineAs(ORG_ADMIN, itemId)).body.timeline).toHaveLength(1);
  });
});

async function changeTier(userId: number, itemId: string, tier: string) {
  signInAs(userId);
  const res = await api().patch(`/api/orgs/${ORG}/items/${itemId}/tier`).send({ tier });
  expect(res.status).toBe(200);
}

function kinds(timeline: Array<{ kind: string }>) {
  return timeline.map((e) => e.kind);
}

describe("GET /api/orgs/:orgId/items/:itemId/timeline: tier changes", () => {
  it("shows each change with who made it, in order", async () => {
    const { itemId } = await listItem();
    await changeTier(GA_CONTACT, itemId, "members");
    await changeTier(ORG_ADMIN, itemId, "internal");

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    expect(kinds(timeline)).toEqual(["listed", "tier_changed", "tier_changed"]);
    expect(timeline[1]).toEqual({
      kind: "tier_changed",
      at: expect.any(String),
      actor: { type: "user", name: "user-2" },
      fromTier: "internal",
      toTier: "members",
    });
    expect(timeline[2]).toMatchObject({
      actor: { type: "user", name: "user-1" },
      fromTier: "members",
      toTier: "internal",
    });
    expect(timeline[1].at < timeline[2].at).toBe(true);
  });

  it("shows an Auto Release as done by the system", async () => {
    const { postId, itemId } = await listItem();
    fakeDb.tierEvents.push({
      id: 99,
      post_id: postId,
      org_id: 10,
      from_tier: "internal",
      to_tier: "members",
      actor_type: "system",
      actor_user_id: null,
      created_at: fakeDb.tick(),
    });

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    expect(timeline[1]).toMatchObject({ kind: "tier_changed", actor: { type: "system" } });
  });
});

async function requestAs(userId: number, postId: number, actingUnitId?: number | null) {
  signInAs(userId);
  const res = await api()
    .post("/api/weaves")
    .send({ postId, items: [{ itemId: null, quantity: 2 }], actingUnitId });
  expect(res.status).toBe(201);
  return res.body.weaveId as number;
}

async function setStatus(userId: number, weaveId: number, status: string) {
  signInAs(userId);
  const res = await api().patch(`/api/weaves/${weaveId}/status`).send({ status });
  expect(res.status).toBe(200);
}

describe("GET /api/orgs/:orgId/items/:itemId/timeline: from request to hand-over", () => {
  it("shows the request, who approved it, each confirmation and the unit that received it", async () => {
    const { postId, itemId } = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, IT_DEPT);
    //* 同單位的另一位窗口核可（不是上架的人）
    await setStatus(GA_CONTACT_2, weaveId, "approved");
    await setStatus(GA_CONTACT, weaveId, "completed");
    await setStatus(IT_CONTACT, weaveId, "completed");

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    const itDept = { id: IT_DEPT, name: "資訊部" };
    expect(timeline.slice(1)).toEqual([
      {
        kind: "requested",
        at: expect.any(String),
        actor: { type: "user", name: "user-3" },
        weaveId,
        receiverUnit: itDept,
        quantity: 2,
      },
      { kind: "approved", at: expect.any(String), actor: { type: "user", name: "user-7" }, weaveId },
      { kind: "confirmed", at: expect.any(String), actor: { type: "user", name: "user-2" }, weaveId },
      {
        kind: "completed",
        at: expect.any(String),
        actor: { type: "user", name: "user-3" },
        weaveId,
        receiver: { name: "user-3" },
        receiverUnit: itDept,
        quantity: 2,
      },
    ]);
  });

  it("records a decline and a personal request's receiver", async () => {
    const { postId, itemId } = await listItem();
    const declined = await requestAs(IT_CONTACT, postId, null);
    await setStatus(ORG_ADMIN, declined, "declined");

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    expect(timeline.slice(1)).toEqual([
      expect.objectContaining({ kind: "requested", weaveId: declined, receiverUnit: null }),
      { kind: "declined", at: expect.any(String), actor: { type: "user", name: "user-1" }, weaveId: declined },
    ]);
  });
});

async function removeMember(membershipId: number) {
  signInAs(ORG_ADMIN);
  const res = await api().delete(`/api/org-admin/orgs/${ORG}/members/${membershipId}`);
  expect(res.status).toBe(204);
}

describe("GET /api/orgs/:orgId/items/:itemId/timeline: after the Unit Contact changes", () => {
  it("keeps the original lister and approver, shows the hand-over, and the item stays with the unit", async () => {
    const { postId, itemId } = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, IT_DEPT);
    await setStatus(GA_CONTACT, weaveId, "approved");
    //* 上架的窗口離職，Org Admin 把物品與進行中的 Weave 交給同單位另一位窗口
    await removeMember(102);
    signInAs(ORG_ADMIN);
    const handover = await api()
      .post(`/api/org-admin/orgs/${ORG}/handovers`)
      .send({ fromUserId: "u-2", unitId: GENERAL_AFFAIRS, toMemberId: 107 });
    expect(handover.status).toBe(200);
    await setStatus(GA_CONTACT_2, weaveId, "completed");
    await setStatus(IT_CONTACT, weaveId, "completed");

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    expect(kinds(timeline)).toEqual([
      "listed",
      "requested",
      "approved",
      "handed_over",
      "handed_over",
      "confirmed",
      "completed",
    ]);
    expect(timeline[0]).toMatchObject({
      actor: { type: "user", name: "user-2" },
      unit: { id: GENERAL_AFFAIRS, name: "總務部" },
    });
    expect(timeline[2]).toMatchObject({ kind: "approved", actor: { type: "user", name: "user-2" } });
    //* 物品本身一筆、進行中的 Weave 一筆；操作者是 Org Admin
    expect(timeline[3]).toEqual({
      kind: "handed_over",
      at: expect.any(String),
      actor: { type: "user", name: "user-1" },
      from: { name: "user-2" },
      to: { name: "user-7" },
      weaveId: null,
    });
    expect(timeline[4]).toMatchObject({ kind: "handed_over", weaveId });
    expect(timeline[5]).toMatchObject({ actor: { type: "user", name: "user-7" } });
    expect(timeline[6]).toMatchObject({
      receiverUnit: { id: IT_DEPT, name: "資訊部" },
      receiver: { name: "user-3" },
    });
  });

  it("shows requests the system declined, on a demotion or a member's removal", async () => {
    const { postId, itemId } = await listItem();
    await changeTier(GA_CONTACT, itemId, "members");
    const memberRequest = await requestAs(ORG_MEMBER, postId);
    const unitRequest = await requestAs(IT_CONTACT, postId, IT_DEPT);
    await changeTier(ORG_ADMIN, itemId, "internal");
    await removeMember(103);

    const { timeline } = (await timelineAs(ORG_ADMIN, itemId)).body;

    const declines = timeline.filter((e: { kind: string }) => e.kind === "declined");
    expect(declines).toEqual([
      { kind: "declined", at: expect.any(String), actor: { type: "system" }, weaveId: memberRequest },
      { kind: "declined", at: expect.any(String), actor: { type: "system" }, weaveId: unitRequest },
    ]);
  });
});

describe("GET /api/orgs/:orgId/items/:itemId/timeline: a deleted item", () => {
  it("keeps its history and shows when it was deleted", async () => {
    const { postId, itemId } = await listItem();
    fakeDb.posts.find((p) => p.id === postId)!.deleted_at = fakeDb.tick();

    const res = await timelineAs(ORG_ADMIN, itemId);

    expect(res.status).toBe(200);
    expect(res.body.timeline[1]).toEqual({ kind: "deleted", at: expect.any(String), actor: null });
  });
});

describe("GET /api/orgs/:orgId/items: where each item went", () => {
  async function handOver(postId: number, requester: number, actingUnitId: number | null) {
    const weaveId = await requestAs(requester, postId, actingUnitId);
    await setStatus(ORG_ADMIN, weaveId, "approved");
    await setStatus(GA_CONTACT, weaveId, "completed");
    await setStatus(requester, weaveId, "completed");
    return weaveId;
  }

  it("lists the unit's items with the units or people that received them, filtered by unit", async () => {
    const monitor = await listItem();
    const itItem = await listItem(IT_CONTACT, IT_DEPT);
    const toUnit = await handOver(monitor.postId, IT_CONTACT, IT_DEPT);
    await changeTier(GA_CONTACT, monitor.itemId, "members");
    const toPerson = await handOver(monitor.postId, ORG_MEMBER, null);
    await requestAs(IT_CONTACT, monitor.postId, IT_DEPT); //* 進行中的申請不是去向

    signInAs(ORG_ADMIN);
    const res = await api().get(`/api/orgs/${ORG}/items?unitId=${GENERAL_AFFAIRS}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([monitor.itemId]);
    expect(res.body.items[0].outcomes).toEqual([
      {
        weaveId: toUnit,
        completedAt: expect.any(String),
        quantity: 2,
        receiver: { name: "user-3" },
        receiverUnit: { id: IT_DEPT, name: "資訊部" },
      },
      {
        weaveId: toPerson,
        completedAt: expect.any(String),
        quantity: 2,
        receiver: { name: "user-4" },
        receiverUnit: null,
      },
    ]);

    const all = await api().get(`/api/orgs/${ORG}/items`);
    const it = all.body.items.find((i: { id: string }) => i.id === itItem.itemId);
    expect(it.outcomes).toEqual([]);
  });
});
