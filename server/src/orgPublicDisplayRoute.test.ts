/**
 * Public 組織物品的發文者顯示（#140，PRD 0001 §5.1「公開層顯示」；ADR 0004）
 *
 * 透過 HTTP 測 `/api/weaves` 與通知：民眾申請 Public 的組織物品後，
 * - Weave 畫面裡的 Giver 與發文者是組織名義，不出現窗口的名稱、頭像或帳號
 * - 核可等通知與 Email 以組織名義送出，通知不記窗口為寄件人
 * - 申請開的是組織對話（和窗口的個人對話分開），民眾的申請與私訊由經手窗口的帳號接收
 * - 同組織的同事（Internal 認領）照舊看到彼此
 * MySQL 換成記憶體裡的假資料表；向量索引、熱門排行、通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { errorMiddleware } from "./utils/errorHandler";
import { createNotification } from "./utils/notificationService";
import { enqueueSendEmail } from "./queue/queues";
import { messageService } from "./utils/messageService";
import { runPendingPublic } from "./services/orgPendingPublicService";
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

jest.mock("./utils/redis", () => ({
  getVectorRedisClient: () => ({ exists: async () => 1, hSet: async () => 1 }),
  getCacheRedisClient: () => ({
    exists: async () => 0,
    zAdd: async () => 1,
    zRem: async () => 1,
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

jest.mock("./services/postService", () => ({
  postService: { enqueueEmbeddingForPost: jest.fn().mockResolvedValue(undefined) },
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

const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架的人
const IT_CONTACT = 3;
const PUBLIC_USER = 5; //* 不是甲公司成員

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

//* 窗口本人的任何痕跡：名稱、users.public_id、頭像（假資料的命名見 fakeOrgWeavesDb）
const CONTACT_TRACES = /user-2\b|u-2\b|avatar-2\b/;

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

async function listItem() {
  signInAs(GA_CONTACT);
  const res = await api().post(`/api/orgs/${ORG}/items`).send({
    unitId: GENERAL_AFFAIRS,
    title: "27 吋螢幕",
    content: "汰換下來，功能正常",
    orgCategory: "display",
    quantity: 3,
    unitWeightKg: 5,
    conditionLevel: 2,
  });
  expect(res.status).toBe(201);
  const post = fakeDb.posts.find((p) => p.public_id === res.body.item.id)!;
  return { postId: post.id, publicId: post.public_id };
}

async function listPublicItem() {
  const item = await listItem();
  signInAs(ORG_ADMIN);
  const listing = {
    categoryId: 3,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    location: { place_id: "place-e2e", full_address: "台北市信義區", lat: 25.03, lng: 121.56 },
  };
  expect((await api().post(`/api/orgs/${ORG}/items/${item.publicId}/pending-public`).send({ listing })).status).toBe(200);
  await runPendingPublic(new Date(Date.now() + 11 * 60_000));
  expect(fakeDb.posts.find((p) => p.id === item.postId)!.audience_tier).toBe("public");
  return item;
}

async function requestAs(userId: number, postId: number, extra: Record<string, unknown> = {}) {
  signInAs(userId);
  const res = await api()
    .post("/api/weaves")
    .send({ postId, items: [{ itemId: fakeDb.items.find((i) => i.post_id === postId)!.id, quantity: 1 }], ...extra });
  expect(res.status).toBe(201);
  return Number(res.body.weaveId);
}

async function weaveAs(userId: number, weaveId: number) {
  signInAs(userId);
  const res = await api().get(`/api/weaves/${weaveId}`);
  expect(res.status).toBe(200);
  return res.body.weave;
}

function seed(publisherDisplay: "org" | "org_unit" | "anonymous" = "org") {
  const userIds = [ORG_ADMIN, GA_CONTACT, IT_CONTACT, PUBLIC_USER];
  fakeDb = createFakeOrgPendingPublicDb({
    users: userIds.map((id) => ({ id, email: `user${id}@example.com` })),
    organizations: [
      {
        id: 10,
        public_id: ORG,
        name: "甲公司",
        publisher_display: publisherDisplay,
        is_demo: false,
        auto_release_enabled: true,
        auto_release_days: 30,
      },
    ],
    memberships: [
      { id: 101, org_id: 10, user_id: ORG_ADMIN, org_role: "admin", access_level: "internal" },
      { id: 102, org_id: 10, user_id: GA_CONTACT, org_role: "member", access_level: "internal" },
      { id: 103, org_id: 10, user_id: IT_CONTACT, org_role: "member", access_level: "internal" },
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
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
});

describe("a member of the public claims a Public org item", () => {
  it("sees the org as the giver and poster, never the Unit Contact", async () => {
    const { postId, publicId } = await listPublicItem();
    const weaveId = await requestAs(PUBLIC_USER, postId);

    const weave = await weaveAs(PUBLIC_USER, weaveId);

    expect(weave).toMatchObject({
      giver_name: "甲公司",
      giver_avatar: null,
      giver_id: null,
      post: {
        username: "甲公司",
        avatar_url: null,
        user_id: null,
        author_user_id: null,
        author_public_id: `org-post:${publicId}`,
      },
    });
    expect(JSON.stringify(weave)).not.toMatch(CONTACT_TRACES);
  });

  it("follows the org's display setting", async () => {
    seed("org_unit");
    const { postId } = await listPublicItem();
    const weaveId = await requestAs(PUBLIC_USER, postId);

    expect((await weaveAs(PUBLIC_USER, weaveId)).giver_name).toBe("甲公司 · 總務部");
  });

  it("opens an org conversation that the handling contact receives", async () => {
    const { postId } = await listPublicItem();
    await requestAs(PUBLIC_USER, postId);

    expect(messageService.getConversationId).toHaveBeenCalledWith(PUBLIC_USER, GA_CONTACT, {
      orgId: 10,
      orgUserId: GA_CONTACT,
    });
  });

  it("gets the approval notification and email in the org's name, with no personal sender", async () => {
    const { postId } = await listPublicItem();
    const weaveId = await requestAs(PUBLIC_USER, postId);
    jest.clearAllMocks();

    signInAs(GA_CONTACT);
    const res = await api().patch(`/api/weaves/${weaveId}/status`).send({ status: "approved" });
    expect(res.status).toBe(200);

    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: PUBLIC_USER,
        sender_id: null,
        params: expect.objectContaining({ actorName: "甲公司" }),
      }),
    );
    expect(enqueueSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: PUBLIC_USER, actorName: "甲公司" }),
    );
    expect(JSON.stringify((createNotification as jest.Mock).mock.calls)).not.toMatch(CONTACT_TRACES);
  });

  it("still shows the contact the requester as a person", async () => {
    const { postId } = await listPublicItem();
    const weaveId = await requestAs(PUBLIC_USER, postId);

    const weave = await weaveAs(GA_CONTACT, weaveId);
    expect(weave).toMatchObject({ giver_name: "user-2", receiver_name: "user-5" });
  });
});

describe("colleagues inside the org", () => {
  it("still see each other on an Internal claim", async () => {
    const { postId } = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    const weave = await weaveAs(IT_CONTACT, weaveId);
    expect(weave).toMatchObject({ giver_name: "user-2", giver_id: GA_CONTACT });
  });
});
