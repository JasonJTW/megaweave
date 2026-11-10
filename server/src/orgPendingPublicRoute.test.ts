/**
 * 升到 Public：待公開期、財產確認、演示組織跳過與 Public 降級（#140，PRD 0001 §5.1 E2-6、E2-7、E4-2；ADR 0003）
 *
 * 透過 HTTP 測 `/api/orgs/:orgId/items/:itemId/pending-public`：
 * - 只有 Org Admin 能把物品送進「待公開」；有財產編號的要確認「已完成報廢／處分程序」
 * - 待公開期間仍依原層級顯示，可一鍵取消（回到原層級並留下紀錄）
 * - 10 分鐘到（排程 runPendingPublic）才正式升到 Public；演示組織的管理員可以跳過
 * - 正式公開進熱門排行與公開向量 scope，降級時移除
 * MySQL 換成記憶體裡的假資料表；向量索引、熱門排行、通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import orgItemsRouter from "./orgItems";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { createNotification } from "./utils/notificationService";
import { postService } from "./services/postService";
import { runPendingPublic, PENDING_PUBLIC_DELAY_MS } from "./services/orgPendingPublicService";
import {
  createFakeOrgPendingPublicDb,
  FakeOrgPendingPublicDb,
} from "./testUtils/fakeOrgPendingPublicDb";

let fakeDb: FakeOrgPendingPublicDb;

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => fakeDb.connection.query(...args),
    execute: (...args: unknown[]) => fakeDb.connection.execute(...args),
    getConnection: () => Promise.resolve(fakeDb.connection),
  },
}));

//* 向量索引：每篇貼文都已在索引裡，記下最後寫入的 scope；熱門排行記下成員
const vectorScopes = new Map<string, string>();
const trending = new Map<string, number>();
jest.mock("./utils/redis", () => ({
  getVectorRedisClient: () => ({
    exists: async () => 1,
    hSet: async (key: string, fields: Record<string, string>) => {
      vectorScopes.set(key, fields.scope);
      return 1;
    },
  }),
  getCacheRedisClient: () => ({
    exists: async () => 1,
    zAdd: async (_key: string, member: { score: number; value: string }) => {
      trending.set(member.value, member.score);
      return 1;
    },
    zRem: async (_key: string, value: string) => {
      trending.delete(value);
      return 1;
    },
  }),
}));

jest.mock("./session", () =>
  jest.requireActual("./testUtils/mockSessionModule").mockSessionModule(),
);

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

//* 公開資訊改了要重建語意向量；這裡只確認有排入
jest.mock("./services/postService", () => ({
  postService: { enqueueEmbeddingForPost: jest.fn().mockResolvedValue(undefined) },
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const DEMO_ORG = "22222222-2222-4222-8222-222222222222";

const ORG_ADMIN = 1;
const GA_CONTACT = 2;
const DEMO_ADMIN = 3;
const DEMO_CONTACT = 4;

const GENERAL_AFFAIRS = 201;
const DEMO_UNIT = 301;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.io = { to: () => ({ emit: () => {} }) };
    next();
  });
  app.use("/api/orgs", orgItemsRouter);
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
  title: "27 吋螢幕",
  content: "汰換下來，功能正常",
  orgCategory: "display",
  quantity: 3,
  unitWeightKg: 5,
  conditionLevel: 2,
};

async function listItem(
  as = GA_CONTACT,
  extra: Record<string, unknown> = {},
  { org = ORG, unitId = GENERAL_AFFAIRS } = {},
) {
  signInAs(as);
  const res = await api()
    .post(`/api/orgs/${org}/items`)
    .send({ ...MONITOR, unitId, ...extra });
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  return { postId: post.id, publicId: post.public_id };
}

//* 公開資訊：像一般貼文一樣有地點、到期日、分類，標籤選填
const TAIPEI_101 = {
  place_id: "ChIJH56c2rarQjQRphD9gvC8BhI",
  full_address: "110台北市信義區信義路五段7號",
  name: "台北101",
  city: "信義區",
  province: "台北市",
  lat: 25.033976,
  lng: 121.5645389,
};

function listing(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: 3,
    tags: "螢幕, 辦公設備",
    expiresAt: minutesFromNow(60 * 24 * 30).toISOString(),
    location: TAIPEI_101,
    ...overrides,
  };
}

function startPendingAs(userId: number, publicId: string, body: Record<string, unknown> = {}, org = ORG) {
  signInAs(userId);
  return api()
    .post(`/api/orgs/${org}/items/${publicId}/pending-public`)
    .send({ listing: listing(), ...body });
}

function getListingAs(userId: number, publicId: string, org = ORG) {
  signInAs(userId);
  return api().get(`/api/orgs/${org}/items/${publicId}/public-listing`);
}

function cancelPendingAs(userId: number, publicId: string, org = ORG) {
  signInAs(userId);
  return api().delete(`/api/orgs/${org}/items/${publicId}/pending-public`);
}

function skipPendingAs(userId: number, publicId: string, org = ORG) {
  signInAs(userId);
  return api().post(`/api/orgs/${org}/items/${publicId}/pending-public/skip`);
}

function postRow(postId: number) {
  return fakeDb.posts.find((p) => p.id === postId)!;
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

beforeEach(() => {
  jest.clearAllMocks();
  vectorScopes.clear();
  trending.clear();
  const userIds = [ORG_ADMIN, GA_CONTACT, DEMO_ADMIN, DEMO_CONTACT];
  fakeDb = createFakeOrgPendingPublicDb({
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
        public_id: DEMO_ORG,
        name: "演示公司",
        publisher_display: "org",
        is_demo: true,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
    ],
    memberships: [
      { id: 101, org_id: 10, user_id: ORG_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 102, org_id: 10, user_id: GA_CONTACT, org_role: "member", access_level: "internal" },
      { id: 201, org_id: 20, user_id: DEMO_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 202, org_id: 20, user_id: DEMO_CONTACT, org_role: "member", access_level: "internal" },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: DEMO_UNIT, org_id: 20, name: "演示單位" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 20, org_unit_id: DEMO_UNIT, membership_id: 202 },
    ],
  });
});

describe("an Org Admin sends an item to Pending Public", () => {
  it("keeps the item in its tier for 10 minutes and shows when it goes public", async () => {
    const { postId, publicId } = await listItem();
    const before = Date.now();

    const res = await startPendingAs(ORG_ADMIN, publicId);

    expect(res.status).toBe(200);
    expect(res.body.item.audienceTier).toBe("internal");
    const dueAt = Date.parse(res.body.item.pendingPublic.dueAt);
    expect(dueAt - before).toBeGreaterThanOrEqual(PENDING_PUBLIC_DELAY_MS - 1000);
    expect(dueAt - Date.now()).toBeLessThanOrEqual(PENDING_PUBLIC_DELAY_MS);
    expect(postRow(postId).audience_tier).toBe("internal");
    expect(fakeDb.tierEvents).toHaveLength(0);
    //* 待公開期不進排行、不發通知
    expect(trending.size).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("refuses a Unit Contact with ORG_TIER_NOT_ALLOWED", async () => {
    const { publicId } = await listItem();
    const res = await startPendingAs(GA_CONTACT, publicId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
    expect(fakeDb.pendingEvents).toHaveLength(0);
  });

  it("asks for the disposal confirmation when the item has an asset number", async () => {
    const { publicId } = await listItem(GA_CONTACT, { assetNumber: "A-2024-001" });

    const refused = await startPendingAs(ORG_ADMIN, publicId);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("ORG_ASSET_DISPOSAL_UNCONFIRMED");
    expect(refused.body.item).toBeUndefined();

    const res = await startPendingAs(ORG_ADMIN, publicId, { assetDisposalConfirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.item.pendingPublic).not.toBeNull();
    expect(fakeDb.pendingEvents).toEqual([
      expect.objectContaining({ action: "started", actor_user_id: ORG_ADMIN, asset_disposal_confirmed: 1 }),
    ]);
  });

  it("rejects an item that is already Public as INVALID_REQUEST", async () => {
    const { publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    await runPendingPublic(minutesFromNow(11));

    const res = await startPendingAs(ORG_ADMIN, publicId);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("still lets older items without org details change tier, but not go pending", async () => {
    const { postId, publicId } = await listItem();
    fakeDb.details.splice(fakeDb.details.findIndex((d) => d.post_id === postId), 1);

    signInAs(ORG_ADMIN);
    const promote = await api().patch(`/api/orgs/${ORG}/items/${publicId}/tier`).send({ tier: "members" });
    expect(promote.status).toBe(200);
    const pending = await startPendingAs(ORG_ADMIN, publicId);
    expect(pending.status).toBe(404);
  });

  it("blocks other tier changes while the item is pending", async () => {
    const { publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);

    signInAs(ORG_ADMIN);
    const res = await api().patch(`/api/orgs/${ORG}/items/${publicId}/tier`).send({ tier: "members" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORG_ITEM_PENDING_PUBLIC");
  });
});

describe("the public listing an Org Admin fills in before going public", () => {
  it("starts empty, because org items are listed without a location, expiry or tags", async () => {
    const { publicId } = await listItem();

    const res = await getListingAs(ORG_ADMIN, publicId);

    expect(res.status).toBe(200);
    expect(res.body.listing).toEqual({
      categoryId: expect.any(Number),
      tags: null,
      expiresAt: null,
      location: null,
    });
  });

  it("is saved with the pending request and prefilled the next time", async () => {
    const { postId, publicId } = await listItem();
    const expiresAt = minutesFromNow(60 * 24 * 14).toISOString();

    const res = await startPendingAs(ORG_ADMIN, publicId, {
      listing: listing({ categoryId: 5, expiresAt, tags: "螢幕" }),
    });

    expect(res.status).toBe(200);
    expect(postRow(postId)).toMatchObject({ category_id: 5, tags: "螢幕", location_id: expect.any(Number) });
    expect(postRow(postId).expires_at?.toISOString()).toBe(expiresAt);
    //* 分類、標籤、地點會進語意向量，要重建
    expect(postService.enqueueEmbeddingForPost).toHaveBeenCalledWith(postId);

    const prefill = await getListingAs(ORG_ADMIN, publicId);
    expect(prefill.body.listing).toEqual({
      categoryId: 5,
      tags: "螢幕",
      expiresAt,
      location: expect.objectContaining({
        placeId: TAIPEI_101.place_id,
        fullAddress: TAIPEI_101.full_address,
        lat: TAIPEI_101.lat,
        lng: TAIPEI_101.lng,
      }),
    });
  });

  it("lets the tags stay empty, like a regular post", async () => {
    const { postId, publicId } = await listItem();
    const res = await startPendingAs(ORG_ADMIN, publicId, { listing: listing({ tags: "" }) });
    expect(res.status).toBe(200);
    expect(postRow(postId).tags).toBeNull();
  });

  it.each([
    ["no location", { location: undefined }],
    ["a location without coordinates", { location: { ...TAIPEI_101, lat: undefined } }],
    ["no expiry date", { expiresAt: undefined }],
    ["an expiry date in the past", { expiresAt: minutesFromNow(-5).toISOString() }],
    ["no category", { categoryId: undefined }],
  ])("refuses %s as VALIDATION_FAILED and does not start the pending period", async (_label, overrides) => {
    const { postId, publicId } = await listItem();

    const res = await startPendingAs(ORG_ADMIN, publicId, { listing: listing(overrides) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.item).toBeUndefined();
    expect(fakeDb.pendingEvents).toHaveLength(0);
    expect(postRow(postId).location_id ?? null).toBeNull();
  });

  it("refuses a request without any listing", async () => {
    const { publicId } = await listItem();
    signInAs(ORG_ADMIN);
    const res = await api().post(`/api/orgs/${ORG}/items/${publicId}/pending-public`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("refuses an inactive or unknown category as INVALID_CATEGORY and saves nothing", async () => {
    const { postId, publicId } = await listItem();

    const res = await startPendingAs(ORG_ADMIN, publicId, { listing: listing({ categoryId: 999 }) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CATEGORY");
    expect(postRow(postId).location_id ?? null).toBeNull();
    expect(fakeDb.pendingEvents).toHaveLength(0);
  });

  it("is only shown to Org Admins", async () => {
    const { publicId } = await listItem();
    const res = await getListingAs(GA_CONTACT, publicId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
  });
});

describe("cancelling Pending Public", () => {
  it("keeps the item in its original tier and records the cancellation", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);

    const res = await cancelPendingAs(ORG_ADMIN, publicId);

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ audienceTier: "internal", pendingPublic: null });
    expect(fakeDb.pendingEvents.map((e) => e.action)).toEqual(["started", "cancelled"]);

    //* 時間到了也不會公開
    await runPendingPublic(minutesFromNow(11));
    expect(postRow(postId).audience_tier).toBe("internal");
    expect(fakeDb.tierEvents).toHaveLength(0);
  });

  it("shows the pending period and its cancellation on the item timeline", async () => {
    const { publicId } = await listItem(GA_CONTACT, { assetNumber: "A-2024-001" });
    await startPendingAs(ORG_ADMIN, publicId, { assetDisposalConfirmed: true });
    await cancelPendingAs(ORG_ADMIN, publicId);

    signInAs(ORG_ADMIN);
    const res = await api().get(`/api/orgs/${ORG}/items/${publicId}/timeline`);
    expect(res.status).toBe(200);
    const steps = (res.body.timeline as { kind: string }[]).filter((e) =>
      e.kind.startsWith("public_pending"),
    );
    expect(steps).toEqual([
      {
        kind: "public_pending_started",
        at: expect.any(String),
        actor: { type: "user", name: `user-${ORG_ADMIN}` },
        assetDisposalConfirmed: true,
      },
      {
        kind: "public_pending_cancelled",
        at: expect.any(String),
        actor: { type: "user", name: `user-${ORG_ADMIN}` },
        assetDisposalConfirmed: false,
      },
    ]);
  });

  it("answers ORG_PENDING_PUBLIC_NOT_PENDING once the item already went public", async () => {
    const { publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    await runPendingPublic(minutesFromNow(11));

    const res = await cancelPendingAs(ORG_ADMIN, publicId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORG_PENDING_PUBLIC_NOT_PENDING");
  });
});

describe("the pending period running out", () => {
  it("does nothing before 10 minutes, then makes the item Public in the feed's ranking and vector scope", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);

    expect(await runPendingPublic(minutesFromNow(5))).toEqual({ published: 0 });
    expect(postRow(postId).audience_tier).toBe("internal");

    expect(await runPendingPublic(minutesFromNow(11))).toEqual({ published: 1 });
    expect(postRow(postId).audience_tier).toBe("public");
    expect(vectorScopes.get(`post:${postId}`)).toBe("public");
    expect(trending.has(String(postId))).toBe(true);
    //* 層級紀錄記下送出待公開的管理員
    expect(fakeDb.tierEvents).toEqual([
      expect.objectContaining({ from_tier: "internal", to_tier: "public", actor_user_id: ORG_ADMIN }),
    ]);

    signInAs(ORG_ADMIN);
    const list = await api().get(`/api/orgs/${ORG}/items`);
    expect(list.body.items[0]).toMatchObject({ audienceTier: "public", pendingPublic: null });
  });

  it("does not publish an item whose expiry date passed during the pending period", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    postRow(postId).expires_at = minutesFromNow(5);

    expect(await runPendingPublic(minutesFromNow(11))).toEqual({ published: 0 });
    expect(postRow(postId).audience_tier).toBe("internal");
    expect(fakeDb.tierEvents).toHaveLength(0);
    //* 不再每分鐘重試：待公開狀態清掉，管理員要重新送出
    signInAs(ORG_ADMIN);
    const list = await api().get(`/api/orgs/${ORG}/items`);
    expect(list.body.items[0].pendingPublic).toBeNull();
  });

  it("drops a pending item that was deleted meanwhile", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    postRow(postId).deleted_at = new Date();

    expect(await runPendingPublic(minutesFromNow(11))).toEqual({ published: 0 });
    expect(postRow(postId).audience_tier).toBe("internal");
  });
});

describe("skipping the pending period", () => {
  it("is only offered to demo orgs: their admin publishes at once", async () => {
    const { postId, publicId } = await listItem(DEMO_CONTACT, {}, { org: DEMO_ORG, unitId: DEMO_UNIT });
    await startPendingAs(DEMO_ADMIN, publicId, {}, DEMO_ORG);

    const res = await skipPendingAs(DEMO_ADMIN, publicId, DEMO_ORG);

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ audienceTier: "public", pendingPublic: null });
    expect(postRow(postId).audience_tier).toBe("public");
    expect(fakeDb.pendingEvents.map((e) => e.action)).toEqual(["started", "skipped"]);
  });

  it("tells the client whether the org may skip", async () => {
    signInAs(DEMO_ADMIN);
    expect((await api().get(`/api/orgs/${DEMO_ORG}`)).body.org.isDemo).toBe(true);
    signInAs(ORG_ADMIN);
    expect((await api().get(`/api/orgs/${ORG}`)).body.org.isDemo).toBe(false);
  });

  it("refuses to skip once the listing is no longer complete", async () => {
    const { postId, publicId } = await listItem(DEMO_CONTACT, {}, { org: DEMO_ORG, unitId: DEMO_UNIT });
    await startPendingAs(DEMO_ADMIN, publicId, {}, DEMO_ORG);
    postRow(postId).location_id = null;

    const res = await skipPendingAs(DEMO_ADMIN, publicId, DEMO_ORG);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ORG_PUBLIC_LISTING_INCOMPLETE");
    expect(postRow(postId).audience_tier).toBe("internal");
  });

  it("refuses a regular org's admin and keeps the 10-minute wait", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);

    const res = await skipPendingAs(ORG_ADMIN, publicId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_PENDING_PUBLIC_SKIP_NOT_ALLOWED");
    expect(postRow(postId).audience_tier).toBe("internal");
  });

  it("refuses a demo org's Unit Contact", async () => {
    const { publicId } = await listItem(DEMO_CONTACT, {}, { org: DEMO_ORG, unitId: DEMO_UNIT });
    await startPendingAs(DEMO_ADMIN, publicId, {}, DEMO_ORG);

    const res = await skipPendingAs(DEMO_CONTACT, publicId, DEMO_ORG);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
  });
});

describe("demoting a Public item", () => {
  it("takes it out of the trending ranking and the public vector scope", async () => {
    const { postId, publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    await runPendingPublic(minutesFromNow(11));
    expect(trending.has(String(postId))).toBe(true);

    signInAs(ORG_ADMIN);
    const res = await api().patch(`/api/orgs/${ORG}/items/${publicId}/tier`).send({ tier: "members" });

    expect(res.status).toBe(200);
    expect(postRow(postId).audience_tier).toBe("members");
    expect(trending.has(String(postId))).toBe(false);
    expect(vectorScopes.get(`post:${postId}`)).toBe("org:10:members");
  });

  it("is refused for a Unit Contact", async () => {
    const { publicId } = await listItem();
    await startPendingAs(ORG_ADMIN, publicId);
    await runPendingPublic(minutesFromNow(11));

    signInAs(GA_CONTACT);
    const res = await api().patch(`/api/orgs/${ORG}/items/${publicId}/tier`).send({ tier: "members" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
  });
});
