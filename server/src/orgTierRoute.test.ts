/**
 * 升到 Members、降級與 Org Member 認領（#138，PRD 0001 §5.1 E2-2、E2-6；ADR 0003、ADR 0004）
 *
 * 透過 HTTP 測 `PATCH /api/orgs/:orgId/items/:itemId/tier`、層級紀錄與 `/api/weaves`：
 * - Unit Contact 只能把自己單位的物品從 Internal 升到 Members；Org Admin 可升降任何物品
 * - 降級時，看不到新層級的人的 Requested 請求自動婉拒並通知；有 Approved／Completed 的物品不能降級
 * - 每次層級變更都留下紀錄（誰、何時、從哪層到哪層）
 * - Org Member 在組織頁看到 Members 物品並可申請
 * MySQL 換成記憶體裡的假資料表；向量索引、通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import request from "supertest";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { createNotification } from "./utils/notificationService";
import { enqueueSendEmail } from "./queue/queues";
import { createFakeOrgTierDb, FakeOrgTierDb } from "./testUtils/fakeOrgTierDb";

let fakeDb: FakeOrgTierDb;

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => fakeDb.connection.query(...args),
    execute: (...args: unknown[]) => fakeDb.connection.execute(...args),
    getConnection: () => Promise.resolve(fakeDb.connection),
  },
}));

//* 向量索引：每篇貼文都已在索引裡，記下最後寫入的 scope
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

jest.mock("./utils/messageService", () => ({
  messageService: { getConversationId: jest.fn().mockResolvedValue(null) },
}));

jest.mock("./utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

//* 帳號
const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架物品的人
const IT_CONTACT = 3; //* 只負責資訊部
const ORG_MEMBER = 4;
const OUTSIDER = 5;
const ORG_MEMBER_2 = 6;

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

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

/** 總務部窗口上架一件 Internal 物品 */
async function listInternalItem() {
  signInAs(GA_CONTACT);
  const res = await api().post(`/api/orgs/${ORG}/items`).send(MONITOR);
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  return { postId: post.id, publicId: post.public_id };
}

async function changeTierAs(userId: number, publicId: string, tier: unknown, org = ORG) {
  signInAs(userId);
  return api().patch(`/api/orgs/${org}/items/${publicId}/tier`).send({ tier });
}

async function requestAs(userId: number, postId: number, extra: Record<string, unknown> = {}) {
  signInAs(userId);
  return api()
    .post("/api/weaves")
    .send({ postId, items: [{ itemId: null, quantity: 1 }], ...extra });
}

async function orgPageTitlesFor(userId: number) {
  signInAs(userId);
  const res = await api().get(`/api/orgs/${ORG}/posts`);
  expect(res.status).toBe(200);
  return (res.body.posts as { title: string }[]).map((p) => p.title);
}

function postRow(postId: number) {
  return fakeDb.posts.find((p) => p.id === postId)!;
}

beforeEach(() => {
  jest.clearAllMocks();
  vectorScopes.clear();
  const userIds = [ORG_ADMIN, GA_CONTACT, IT_CONTACT, ORG_MEMBER, OUTSIDER, ORG_MEMBER_2];
  fakeDb = createFakeOrgTierDb({
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
      { id: 101, org_id: 10, user_id: ORG_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 102, org_id: 10, user_id: GA_CONTACT, org_role: "member", access_level: "internal" },
      { id: 103, org_id: 10, user_id: IT_CONTACT, org_role: "member", access_level: "internal" },
      { id: 104, org_id: 10, user_id: ORG_MEMBER, org_role: "member", access_level: "member" },
      { id: 106, org_id: 10, user_id: ORG_MEMBER_2, org_role: "member", access_level: "member" },
      //* 乙公司的 Org Admin 不是甲公司的成員
      { id: 201, org_id: 20, user_id: OUTSIDER, org_role: "admin", access_level: "internal" },
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

describe("a Unit Contact promotes their unit's item to Members", () => {
  it("moves it to Members, shows it to Org Members and records who did it", async () => {
    const { postId, publicId } = await listInternalItem();
    expect(await orgPageTitlesFor(ORG_MEMBER)).toEqual([]);

    const res = await changeTierAs(GA_CONTACT, publicId, "members");

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ id: publicId, audienceTier: "members" });
    expect(postRow(postId).audience_tier).toBe("members");
    expect(await orgPageTitlesFor(ORG_MEMBER)).toEqual(["27 吋螢幕"]);

    signInAs(GA_CONTACT);
    const events = await api().get(`/api/orgs/${ORG}/items/${publicId}/tier-events`);
    expect(events.status).toBe(200);
    expect(events.body.events).toEqual([
      {
        fromTier: "internal",
        toTier: "members",
        actor: { type: "user", name: `user-${GA_CONTACT}` },
        createdAt: expect.any(String),
      },
    ]);
  });
});

describe("who may change an item's tier", () => {
  it.each([
    ["a Unit Contact of another unit", IT_CONTACT, 403, "ORG_UNIT_NOT_MANAGED"],
    ["an Org Member", ORG_MEMBER, 403, "ORG_UNIT_NOT_MANAGED"],
    ["an Org Admin of another org", OUTSIDER, 404, "ORG_NOT_FOUND"],
  ])("refuses %s and leaves the item where it was", async (_who, userId, status, code) => {
    const { postId, publicId } = await listInternalItem();
    const res = await changeTierAs(userId, publicId, "members");

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(postRow(postId).audience_tier).toBe("internal");
    expect(fakeDb.tierEvents).toHaveLength(0);
  });

  it("does not let a Unit Contact move their item to Public", async () => {
    const { postId, publicId } = await listInternalItem();
    const res = await changeTierAs(GA_CONTACT, publicId, "public");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
    expect(postRow(postId).audience_tier).toBe("internal");
  });

  it("does not let a Unit Contact demote their item", async () => {
    const { postId, publicId } = await listInternalItem();
    await changeTierAs(GA_CONTACT, publicId, "members");
    const res = await changeTierAs(GA_CONTACT, publicId, "internal");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
    expect(postRow(postId).audience_tier).toBe("members");
    expect(fakeDb.tierEvents).toHaveLength(1);
  });

  it("lets an Org Admin promote and demote any unit's item, recording both", async () => {
    const { postId, publicId } = await listInternalItem();

    expect((await changeTierAs(ORG_ADMIN, publicId, "members")).status).toBe(200);
    const res = await changeTierAs(ORG_ADMIN, publicId, "internal");

    expect(res.status).toBe(200);
    expect(res.body.item.audienceTier).toBe("internal");
    expect(postRow(postId).audience_tier).toBe("internal");

    signInAs(ORG_ADMIN);
    const events = await api().get(`/api/orgs/${ORG}/items/${publicId}/tier-events`);
    expect(events.body.events.map((e: { fromTier: string; toTier: string }) => [e.fromTier, e.toTier])).toEqual([
      ["internal", "members"],
      ["members", "internal"],
    ]);
    expect(events.body.events[1].actor).toEqual({ type: "user", name: `user-${ORG_ADMIN}` });
  });

  it("keeps Public behind the pending-public flow, even for an Org Admin", async () => {
    const { postId, publicId } = await listInternalItem();
    const res = await changeTierAs(ORG_ADMIN, publicId, "public");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_TIER_NOT_ALLOWED");
    expect(postRow(postId).audience_tier).toBe("internal");
  });

  it.each([
    ["the tier the item is already in", "internal"],
    ["an unknown tier", "everyone"],
  ])("rejects %s as INVALID_REQUEST", async (_what, tier) => {
    const { publicId } = await listInternalItem();
    const res = await changeTierAs(ORG_ADMIN, publicId, tier);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.tierEvents).toHaveLength(0);
  });

  it("returns 404 POST_NOT_FOUND for an item that is not in the org", async () => {
    const res = await changeTierAs(ORG_ADMIN, "33333333-3333-4333-8333-333333333333", "members");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
  });

  it("does not show the tier history to an Org Member", async () => {
    const { publicId } = await listInternalItem();
    signInAs(ORG_MEMBER);
    const res = await api().get(`/api/orgs/${ORG}/items/${publicId}/tier-events`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ORG_UNIT_NOT_MANAGED");
  });
});

describe("the vector index follows the tier", () => {
  it("moves the post's scope to the new tier, and back on demotion", async () => {
    const { postId, publicId } = await listInternalItem();

    await changeTierAs(GA_CONTACT, publicId, "members");
    expect(vectorScopes.get(`post:${postId}`)).toBe("org:10:members");

    await changeTierAs(ORG_ADMIN, publicId, "internal");
    expect(vectorScopes.get(`post:${postId}`)).toBe("org:10:internal");
  });
});

describe("an Org Member claims a Members item", () => {
  it("can request it once it is in Members, personally", async () => {
    const { postId, publicId } = await listInternalItem();
    expect((await requestAs(ORG_MEMBER, postId)).status).toBe(404);

    await changeTierAs(GA_CONTACT, publicId, "members");
    const res = await requestAs(ORG_MEMBER, postId);

    expect(res.status).toBe(201);
    expect(fakeDb.weaves.find((w) => w.id === res.body.weaveId)).toMatchObject({
      receiver_id: ORG_MEMBER,
      receiver_org_unit_id: null,
      status: "requested",
    });
  });
});

describe("demoting an item", () => {
  async function membersItemWithRequests() {
    const item = await listInternalItem();
    await changeTierAs(GA_CONTACT, item.publicId, "members");
    const member = await requestAs(ORG_MEMBER, item.postId);
    const contact = await requestAs(IT_CONTACT, item.postId, { actingUnitId: IT_DEPT });
    expect(member.status).toBe(201);
    expect(contact.status).toBe(201);
    jest.clearAllMocks();
    return { ...item, memberWeaveId: member.body.weaveId, contactWeaveId: contact.body.weaveId };
  }

  it("declines requests from people who can't see the new tier and tells them, keeping the rest", async () => {
    const { publicId, memberWeaveId, contactWeaveId } = await membersItemWithRequests();

    const res = await changeTierAs(ORG_ADMIN, publicId, "internal");

    expect(res.status).toBe(200);
    expect(fakeDb.weaves.find((w) => w.id === memberWeaveId)!.status).toBe("declined");
    expect(fakeDb.weaves.find((w) => w.id === contactWeaveId)!.status).toBe("requested");
    expect(res.body.item.pendingRequestCount).toBe(1);

    //* 通知只給被婉拒的人，以組織名義，不曝光操作者
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: ORG_MEMBER,
        params: expect.objectContaining({ actorName: "甲公司", postTitle: "27 吋螢幕" }),
      }),
    );
    expect(enqueueSendEmail).toHaveBeenCalledTimes(1);
    expect(enqueueSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: ORG_MEMBER, action: "declined", weaveId: memberWeaveId }),
    );
  });

  it.each(["approved", "completed"])(
    "is refused with ORG_TIER_DEMOTION_BLOCKED once a Weave is %s, changing nothing",
    async (status) => {
      const { postId, publicId, memberWeaveId, contactWeaveId } = await membersItemWithRequests();
      fakeDb.weaves.find((w) => w.id === contactWeaveId)!.status = status;

      const res = await changeTierAs(ORG_ADMIN, publicId, "internal");

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ORG_TIER_DEMOTION_BLOCKED");
      expect(postRow(postId).audience_tier).toBe("members");
      expect(fakeDb.weaves.find((w) => w.id === memberWeaveId)!.status).toBe("requested");
      expect(fakeDb.tierEvents).toHaveLength(1);
      expect(createNotification).not.toHaveBeenCalled();
    },
  );

  it("still allows promotion while a Weave is approved", async () => {
    const { postId, publicId } = await listInternalItem();
    const weave = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    fakeDb.weaves.find((w) => w.id === weave.body.weaveId)!.status = "approved";

    const res = await changeTierAs(GA_CONTACT, publicId, "members");
    expect(res.status).toBe(200);
  });
});
