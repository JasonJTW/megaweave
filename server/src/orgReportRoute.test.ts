/**
 * 組織報表（#143，PRD 0001 §5.1 E6-1、E6-2；ADR 0005）
 *
 * 透過 HTTP 跑真的流轉（上架 → 申請 → 核可 → 雙方確認、升到 Members），
 * 再讀 `GET /api/org-admin/orgs/:orgId/report`，確認報表數字與流轉紀錄一致。
 * MySQL 換成記憶體裡的假資料表；通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import orgAdminRouter from "./orgAdmin";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { getProductionFactor } from "./services/avoidedEmissions/avoidedEmissions";
import { FACTOR_TABLE_VERSION } from "./services/avoidedEmissions/factorTable";
import {
  createFakeOrgReportDb,
  FakeOrgReportDb,
} from "./testUtils/fakeOrgReportDb";

let fakeDb: FakeOrgReportDb;

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
  messageService: { getConversationId: jest.fn().mockResolvedValue(null) },
}));

jest.mock("./utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架的人
const IT_CONTACT = 3; //* 資訊部窗口，代表資訊部申請
const ORG_MEMBER = 4;
const OUTSIDER = 5; //* 乙公司的 Org Admin

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

function makeApp() {
  const app = express();
  app.use(express.json());
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

async function listItem(body: Record<string, unknown>) {
  signInAs(GA_CONTACT);
  const res = await api()
    .post(`/api/orgs/${ORG}/items`)
    .send({ unitId: GENERAL_AFFAIRS, content: "", conditionLevel: 2, ...body });
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  return { postId: post.id, publicId: post.public_id };
}

async function requestAs(
  userId: number,
  postId: number,
  quantity: number,
  actingUnitId?: number | null,
) {
  signInAs(userId);
  const res = await api()
    .post("/api/weaves")
    .send({
      postId,
      items: [{ itemId: fakeDb.items.find((i) => i.post_id === postId)!.id, quantity }],
      ...(actingUnitId === undefined ? {} : { actingUnitId }),
    });
  expect(res.status).toBe(201);
  return fakeDb.weaves[fakeDb.weaves.length - 1].id;
}

async function setStatus(userId: number, weaveId: number, status: string) {
  signInAs(userId);
  const res = await api()
    .patch(`/api/weaves/${weaveId}/status`)
    .send({ status });
  expect(res.status).toBe(200);
}

/** 申請、核可、雙方確認 */
async function complete(
  receiverId: number,
  postId: number,
  quantity: number,
  actingUnitId?: number | null,
) {
  const weaveId = await requestAs(receiverId, postId, quantity, actingUnitId);
  await setStatus(GA_CONTACT, weaveId, "approved");
  await setStatus(GA_CONTACT, weaveId, "completed");
  await setStatus(receiverId, weaveId, "completed");
  return weaveId;
}

async function report(userId = ORG_ADMIN, org = ORG) {
  signInAs(userId);
  return api().get(`/api/org-admin/orgs/${org}/report`);
}

beforeEach(() => {
  jest.clearAllMocks();
  const userIds = [ORG_ADMIN, GA_CONTACT, IT_CONTACT, ORG_MEMBER, OUTSIDER];
  fakeDb = createFakeOrgReportDb({
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
      {
        id: 101,
        org_id: 10,
        user_id: ORG_ADMIN,
        org_role: "admin",
        access_level: "internal",
      },
      {
        id: 102,
        org_id: 10,
        user_id: GA_CONTACT,
        org_role: "member",
        access_level: "internal",
      },
      {
        id: 103,
        org_id: 10,
        user_id: IT_CONTACT,
        org_role: "member",
        access_level: "internal",
      },
      {
        id: 104,
        org_id: 10,
        user_id: ORG_MEMBER,
        org_role: "member",
        access_level: "member",
      },
      {
        id: 201,
        org_id: 20,
        user_id: OUTSIDER,
        org_role: "admin",
        access_level: "internal",
      },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: IT_DEPT, org_id: 10, name: "資訊部" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 103 },
    ],
  });
});

describe("GET /api/org-admin/orgs/:orgId/report", () => {
  it("matches the flow records: listed, completed once per Weave, by tier and unit", async () => {
    //* 鋼櫃 4 件（填 30 kg、單件價值 2000），螢幕 2 件（帶入預設重量）
    const cabinet = await listItem({
      title: "鋼製公文櫃",
      orgCategory: "steel_storage",
      quantity: 4,
      unitWeightKg: 30,
      estimatedValueTwd: 2000,
    });
    signInAs(GA_CONTACT);
    const categories = (await api().get("/api/orgs/item-categories")).body
      .categories as {
      id: string;
      defaultWeightKg: number | null;
    }[];
    const monitorDefault = categories.find(
      (c) => c.id === "display",
    )!.defaultWeightKg!;
    const monitor = await listItem({
      title: "27 吋螢幕",
      orgCategory: "display",
      quantity: 2,
      unitWeightKg: monitorDefault,
    });

    //* 資訊部代表單位拿 3 件鋼櫃；另一筆申請被婉拒、不算
    await complete(IT_CONTACT, cabinet.postId, 3, IT_DEPT);
    const declined = await requestAs(IT_CONTACT, cabinet.postId, 1, IT_DEPT);
    await setStatus(GA_CONTACT, declined, "declined");
    //* 螢幕升到 Members 後，組織成員個人拿 1 件；還有一筆只核可、沒完成
    signInAs(GA_CONTACT);
    expect(
      (
        await api()
          .patch(`/api/orgs/${ORG}/items/${monitor.publicId}/tier`)
          .send({ tier: "members" })
      ).status,
    ).toBe(200);
    await complete(ORG_MEMBER, monitor.postId, 1);
    const pending = await requestAs(ORG_MEMBER, monitor.postId, 1);
    await setStatus(GA_CONTACT, pending, "approved");

    const res = await report();
    expect(res.status).toBe(200);
    const r = res.body.report;

    expect(r.listing).toEqual({ itemCount: 2, quantity: 6 });
    expect(r.circulation).toEqual({ weaveCount: 2, quantity: 4, rate: 4 / 6 });
    //* 與 #141 的流轉紀錄一致：每筆 org_weave_events 'completed' 恰好對應報表算的一筆 Weave
    const completedEvents = fakeDb.weaveEvents.filter(
      (e) => e.action === "completed",
    );
    expect(completedEvents).toHaveLength(r.circulation.weaveCount);
    expect(
      completedEvents.reduce(
        (sum, e) =>
          sum +
          fakeDb.weaveItems
            .filter((wi) => wi.weave_id === e.weave_id)
            .reduce((s, wi) => s + wi.quantity, 0),
        0,
      ),
    ).toBe(r.circulation.quantity);
    expect(
      r.tiers.map((x: { tier: string; reachedItemCount: number }) => [
        x.tier,
        x.reachedItemCount,
      ]),
    ).toEqual([
      ["internal", 2],
      ["members", 1],
      ["public", 0],
    ]);
    expect(r.units).toHaveLength(2);
    expect(r.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit: { id: IT_DEPT, name: "資訊部" },
          listedQuantity: 0,
          givenQuantity: 0,
          receivedQuantity: 3,
        }),
        expect.objectContaining({
          unit: { id: GENERAL_AFFAIRS, name: "總務部" },
          listedQuantity: 6,
          givenQuantity: 4,
          receivedQuantity: 0,
        }),
      ]),
    );

    const steel = getProductionFactor("steel_storage").kgCO2ePerKg!;
    const display = getProductionFactor("display").kgCO2ePerKg!;
    const potential = 90 * steel + monitorDefault * display;
    expect(r.emissions.factorTableVersion).toBe(FACTOR_TABLE_VERSION);
    expect(r.emissions.totalWeightKg).toBeCloseTo(90 + monitorDefault, 6);
    expect(r.emissions.defaultWeightKg).toBeCloseTo(monitorDefault, 6);
    expect(r.emissions.potentialKgCO2e).toBeCloseTo(potential, 6);
    expect(r.emissions.estimatedKgCO2e).toBeCloseTo(potential * 0.5, 6);
    expect(r.emissions.replacementRate).toMatchObject({
      value: 0.5,
      status: "assumed",
    });
    expect(r.emissions.uncountedQuantity).toBe(0);
    //* 待實現：鋼櫃剩 1 件、螢幕剩 1 件（核可未完成的那件還沒扣庫存）
    expect(r.emissions.unrealized.quantity).toBe(2);
    expect(r.emissions.unrealized.uncountedQuantity).toBe(0);
    expect(r.emissions.unrealized.estimatedKgCO2e).toBeCloseTo(
      (30 * steel + monitorDefault * display) * 0.5,
      6,
    );
    expect(r.value).toEqual({
      estimatedValueTwd: 6000,
      valuedQuantity: 3,
      unvaluedQuantity: 1,
    });
    expect(r.factors.length).toBeGreaterThan(10);
  });

  it("only counts this org's items", async () => {
    await listItem({
      title: "椅子",
      orgCategory: "office_chair",
      quantity: 1,
      unitWeightKg: 13.8,
    });
    signInAs(OUTSIDER);
    const res = await report(OUTSIDER, OTHER_ORG);
    expect(res.status).toBe(200);
    expect(res.body.report.listing).toEqual({ itemCount: 0, quantity: 0 });
  });

  it.each([
    ["a Unit Contact", GA_CONTACT],
    ["an Org Member", ORG_MEMBER],
    ["another org's admin", OUTSIDER],
  ])("hides the report from %s (404 ORG_NOT_FOUND)", async (_label, userId) => {
    const res = await report(userId);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });
});
