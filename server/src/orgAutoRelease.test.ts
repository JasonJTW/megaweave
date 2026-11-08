/**
 * Auto Release 自動升級（#139，PRD 0001 §5.1 E2-3；ADR 0003；CONTEXT.md「Auto Release」）
 *
 * - 排程（runAutoRelease）：Internal 物品在目前層級「無人申請」達設定天數 → 系統升到 Members，寫入層級紀錄
 *   - 計時從進入目前層級起算（最新一筆層級紀錄，沒有就是上架時間）
 *   - 有申請在進行中時暫停；婉拒、撤回後繼續累計；有 Approved 的 Weave 時不升級
 *   - 只自動從 Internal 升到 Members，Public 一律手動
 * - 組織設定（Org Admin）：自動（天數）或手動
 * - 單件覆寫（該單位窗口或 Org Admin）：跟組織設定、自動（天數）、手動
 * MySQL 換成記憶體裡的假資料表；向量索引、通知、Email 換成 jest.fn。
 */

import express from "express";
import request from "supertest";
import orgAdminRouter from "./orgAdmin";
import orgItemsRouter from "./orgItems";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { runAutoRelease } from "./services/orgAutoReleaseService";
import { createFakeOrgAutoReleaseDb } from "./testUtils/fakeOrgAutoReleaseDb";
import type { FakeOrgTierDb } from "./testUtils/fakeOrgTierDb";

let fakeDb: FakeOrgTierDb;

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => fakeDb.connection.query(...args),
    execute: (...args: unknown[]) => fakeDb.connection.execute(...args),
    getConnection: () => Promise.resolve(fakeDb.connection),
  },
}));

const vectorScopes = new Map<string, string>();
jest.mock("./utils/redis", () => ({
  getVectorRedisClient: () => ({
    exists: async () => 1,
    hSet: async (key: string, fields: Record<string, string>) => {
      vectorScopes.set(key, fields.scope);
      return 1;
    },
  }),
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

const ORG = "11111111-1111-4111-8111-111111111111";

const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口
const IT_CONTACT = 3; //* 資訊部窗口，可代表資訊部申請總務部的物品
const ORG_MEMBER = 4;

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-01-01T00:00:00Z");
/** 第 n 天（從物品上架那天算起） */
const day = (n: number) => new Date(T0 + n * DAY_MS);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/org-admin", orgAdminRouter);
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

/** 總務部窗口在第 0 天上架一件 Internal 物品 */
async function listItem(title = "27 吋螢幕") {
  signInAs(GA_CONTACT);
  const res = await api().post(`/api/orgs/${ORG}/items`).send({
    unitId: GENERAL_AFFAIRS,
    title,
    content: "",
    orgCategory: "display",
    quantity: 1,
    unitWeightKg: 5,
    conditionLevel: 2,
  });
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  post.created_at = day(0);
  return { postId: post.id, publicId: post.public_id };
}

/** 一筆申請的時間軸：from 天送出，to 天結束（婉拒、撤回、取消、完成）；to 為 null 表示仍在進行 */
function seedWeave(postId: number, status: string, from: number, to: number | null) {
  const id = Math.max(0, ...fakeDb.weaves.map((w) => w.id)) + 1;
  fakeDb.weaves.push({
    id,
    post_id: postId,
    giver_id: GA_CONTACT,
    receiver_id: IT_CONTACT,
    receiver_org_unit_id: IT_DEPT,
    conversation_id: null,
    status,
    giver_confirmed: 0,
    receiver_confirmed: 0,
    notes: null,
    completed_at: status === "completed" && to !== null ? day(to) : null,
    created_at: day(from),
    updated_at: day(to ?? from),
  });
}

function tierOf(postId: number) {
  return fakeDb.posts.find((p) => p.id === postId)!.audience_tier;
}

async function setOrgSettings(body: Record<string, unknown>, as = ORG_ADMIN) {
  signInAs(as);
  return api().patch(`/api/org-admin/orgs/${ORG}/settings`).send(body);
}

async function setOverride(publicId: string, body: Record<string, unknown>, as = GA_CONTACT) {
  signInAs(as);
  return api().patch(`/api/orgs/${ORG}/items/${publicId}/auto-release`).send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
  vectorScopes.clear();
  fakeDb = createFakeOrgAutoReleaseDb({
    users: [ORG_ADMIN, GA_CONTACT, IT_CONTACT, ORG_MEMBER].map((id) => ({
      id,
      email: `user${id}@example.com`,
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

describe("the Auto Release job", () => {
  it("promotes an Internal item nobody requested for 30 days to Members, as the system", async () => {
    const { postId } = await listItem();

    await runAutoRelease(day(29.9));
    expect(tierOf(postId)).toBe("internal");

    await runAutoRelease(day(30));
    expect(tierOf(postId)).toBe("members");
    expect(fakeDb.tierEvents).toEqual([
      expect.objectContaining({
        post_id: postId,
        from_tier: "internal",
        to_tier: "members",
        actor_type: "system",
        actor_user_id: null,
      }),
    ]);
    expect(vectorScopes.get(`post:${postId}`)).toBe("org:10:members");
  });

  it("shows the system as the actor in the item's tier history", async () => {
    const { publicId } = await listItem();
    await runAutoRelease(day(31));

    signInAs(GA_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}/items/${publicId}/tier-events`);
    expect(res.body.events).toEqual([
      {
        fromTier: "internal",
        toTier: "members",
        actor: { type: "system", name: null },
        createdAt: expect.any(String),
      },
    ]);
  });

  it("never moves a Members item on to Public", async () => {
    const { postId } = await listItem();
    await runAutoRelease(day(30));
    await runAutoRelease(day(400));

    expect(tierOf(postId)).toBe("members");
    expect(fakeDb.tierEvents).toHaveLength(1);
  });

  it("counts from when the item entered its current tier", async () => {
    const { postId } = await listItem();
    //* 第 20 天被 Org Admin 降回 Internal：重新計時
    fakeDb.tierEvents.push(
      {
        id: 900,
        post_id: postId,
        org_id: 10,
        from_tier: "internal",
        to_tier: "members",
        actor_type: "user",
        actor_user_id: GA_CONTACT,
        created_at: day(10),
      },
      {
        id: 901,
        post_id: postId,
        org_id: 10,
        from_tier: "members",
        to_tier: "internal",
        actor_type: "user",
        actor_user_id: ORG_ADMIN,
        created_at: day(20),
      },
    );
    fakeDb.posts.find((p) => p.id === postId)!.audience_tier = "internal";

    await runAutoRelease(day(49));
    expect(tierOf(postId)).toBe("internal");
    await runAutoRelease(day(50));
    expect(tierOf(postId)).toBe("members");
  });

  it("leaves inactive and deleted items alone", async () => {
    const inactive = await listItem("下架的椅子");
    const deleted = await listItem("刪掉的桌子");
    fakeDb.posts.find((p) => p.id === inactive.postId)!.status = "inactive";
    fakeDb.posts.find((p) => p.id === deleted.postId)!.deleted_at = day(1);

    await runAutoRelease(day(60));

    expect(tierOf(inactive.postId)).toBe("internal");
    expect(tierOf(deleted.postId)).toBe("internal");
  });
});

describe("the timer pauses while someone has a request on the item", () => {
  it("does not release an item with a request still waiting for review", async () => {
    const { postId } = await listItem();
    seedWeave(postId, "requested", 10, null);

    await runAutoRelease(day(100));

    expect(tierOf(postId)).toBe("internal");
  });

  it.each(["declined", "withdrawn"])(
    "keeps counting after a request is %s, without the days it was pending",
    async (status) => {
      const { postId } = await listItem();
      //* 第 10–15 天有人申請：這 5 天不算
      seedWeave(postId, status, 10, 15);

      await runAutoRelease(day(34.9));
      expect(tierOf(postId)).toBe("internal");
      await runAutoRelease(day(35));
      expect(tierOf(postId)).toBe("members");
    },
  );

  it("counts overlapping requests' pending time once", async () => {
    const { postId } = await listItem();
    seedWeave(postId, "declined", 10, 20);
    seedWeave(postId, "withdrawn", 15, 25);

    await runAutoRelease(day(44.9));
    expect(tierOf(postId)).toBe("internal");
    await runAutoRelease(day(45));
    expect(tierOf(postId)).toBe("members");
  });

  it("ignores requests that ended before the item entered its current tier", async () => {
    const { postId } = await listItem();
    seedWeave(postId, "declined", 1, 5);
    fakeDb.tierEvents.push({
      id: 900,
      post_id: postId,
      org_id: 10,
      from_tier: "members",
      to_tier: "internal",
      actor_type: "user",
      actor_user_id: ORG_ADMIN,
      created_at: day(10),
    });

    await runAutoRelease(day(40));

    expect(tierOf(postId)).toBe("members");
  });

  it("does not release an item with an approved Weave", async () => {
    const { postId } = await listItem();
    seedWeave(postId, "approved", 1, null);

    await runAutoRelease(day(365));

    expect(tierOf(postId)).toBe("internal");
  });
});

describe("Org Admin settings", () => {
  it("lets the Org Admin read and change the org's auto release setting", async () => {
    signInAs(ORG_ADMIN);
    const before = await api().get(`/api/org-admin/orgs/${ORG}/settings`);
    expect(before.status).toBe(200);
    expect(before.body.settings).toMatchObject({ autoReleaseEnabled: true, autoReleaseDays: 30 });

    const res = await setOrgSettings({ autoReleaseEnabled: true, autoReleaseDays: 14 });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ autoReleaseEnabled: true, autoReleaseDays: 14 });
  });

  it("lets the Org Admin choose how Public items show the publisher (#140)", async () => {
    signInAs(ORG_ADMIN);
    const before = await api().get(`/api/org-admin/orgs/${ORG}/settings`);
    expect(before.body.settings.publisherDisplay).toBe("org");

    const res = await setOrgSettings({ publisherDisplay: "anonymous" });

    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      autoReleaseEnabled: true,
      autoReleaseDays: 30,
      publisherDisplay: "anonymous",
    });
  });

  it("rejects an unknown publisher display as INVALID_REQUEST", async () => {
    const res = await setOrgSettings({ publisherDisplay: "personal" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("releases after the org's day count", async () => {
    const { postId } = await listItem();
    await setOrgSettings({ autoReleaseEnabled: true, autoReleaseDays: 14 });

    await runAutoRelease(day(14));

    expect(tierOf(postId)).toBe("members");
  });

  it("releases nothing when the org is set to manual", async () => {
    const { postId } = await listItem();
    await setOrgSettings({ autoReleaseEnabled: false });

    await runAutoRelease(day(365));

    expect(tierOf(postId)).toBe("internal");
  });

  it.each([0, 366, 1.5])("rejects %p days as VALIDATION_FAILED", async (days) => {
    const res = await setOrgSettings({ autoReleaseDays: days });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it.each([
    ["a Unit Contact", GA_CONTACT],
    ["an Org Member", ORG_MEMBER],
  ])("hides the settings from %s", async (_who, userId) => {
    const res = await setOrgSettings({ autoReleaseEnabled: false }, userId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });

  it("shows the org's setting to the people who manage items", async () => {
    signInAs(GA_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}`);

    expect(res.body.org.autoRelease).toEqual({ enabled: true, days: 30 });
  });
});

describe("overriding one item", () => {
  it("lets the item's Unit Contact switch it to manual, so it is never released", async () => {
    const { postId, publicId } = await listItem();

    const res = await setOverride(publicId, { mode: "manual" });
    expect(res.status).toBe(200);
    expect(res.body.item.autoRelease).toEqual({ override: "manual", days: null });

    await runAutoRelease(day(365));
    expect(tierOf(postId)).toBe("internal");
  });

  it("lets an item release on its own day count, even when the org is manual", async () => {
    const { postId, publicId } = await listItem();
    await setOrgSettings({ autoReleaseEnabled: false });

    const res = await setOverride(publicId, { mode: "auto", days: 7 }, ORG_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.item.autoRelease).toEqual({ override: "auto", days: 7 });

    await runAutoRelease(day(6.9));
    expect(tierOf(postId)).toBe("internal");
    await runAutoRelease(day(7));
    expect(tierOf(postId)).toBe("members");
  });

  it("goes back to the org setting", async () => {
    const { postId, publicId } = await listItem();
    await setOverride(publicId, { mode: "manual" });

    const res = await setOverride(publicId, { mode: "org" });
    expect(res.body.item.autoRelease).toEqual({ override: null, days: null });

    await runAutoRelease(day(30));
    expect(tierOf(postId)).toBe("members");
  });

  it("lists items with no override as following the org", async () => {
    await listItem();
    signInAs(GA_CONTACT);
    const res = await api().get(`/api/orgs/${ORG}/items`);

    expect(res.body.items[0].autoRelease).toEqual({ override: null, days: null });
  });

  it.each([
    ["a Unit Contact of another unit", IT_CONTACT],
    ["an Org Member", ORG_MEMBER],
  ])("refuses %s", async (_who, userId) => {
    const { publicId } = await listItem();
    const res = await setOverride(publicId, { mode: "manual" }, userId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });

  it.each([0, 366, 2.5])("rejects %p days as VALIDATION_FAILED", async (days) => {
    const { publicId } = await listItem();
    const res = await setOverride(publicId, { mode: "auto", days });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it.each([
    ["an unknown mode", { mode: "sometimes" }],
    ["days without auto", { mode: "manual", days: 7 }],
  ])("rejects %s as INVALID_REQUEST", async (_what, body) => {
    const { publicId } = await listItem();
    const res = await setOverride(publicId, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});
