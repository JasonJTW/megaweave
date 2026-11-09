/**
 * 人員異動與交接（#142，PRD 0001 §5.1 E8-1；ADR 0003、ADR 0004）
 *
 * 透過 HTTP 測 `/api/org-admin` 的成員移除與交接，搭配 `/api/orgs`（上架）與 `/api/weaves`（申請、核可、交接）：
 * - 移除成員：他送出、但移除後已沒資格的 Requested 申請自動婉拒；Approved 的保留
 * - 交接：Org Admin 把某人在某單位經手的物品與進行中的 Weave 轉給同單位另一位窗口；
 *   之後的對話與確認交接都由新窗口處理，已結束的 Weave 與交接紀錄保留原操作者
 * MySQL 換成記憶體裡的假資料表；通知、Email、私訊換成 jest.fn。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import orgAdminRouter from "./orgAdmin";
import orgItemsRouter from "./orgItems";
import weavesRouter from "./weaves";
import * as sessionModule from "./session";
import { enqueueSendEmail } from "./queue/queues";
import { messageService } from "./utils/messageService";
import { createNotification } from "./utils/notificationService";
import { errorMiddleware } from "./utils/errorHandler";
import {
  createFakeOrgHandoverDb,
  FakeOrgHandoverDb,
  publicIdOf,
} from "./testUtils/fakeOrgHandoverDb";

let fakeDb: FakeOrgHandoverDb;

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

//* 一對一對話：每對帳號固定一個對話 id，方便斷言 Weave 指到哪個對話；
//* createMessage 回傳寫入的訊息（交接的系統訊息要推播給雙方）
jest.mock("./utils/messageService", () => ({
  messageService: {
    getConversationId: jest.fn(
      async (a: number, b: number) => Math.min(a, b) * 1000 + Math.max(a, b),
    ),
    createMessage: jest.fn(
      async (
        conversationId: number,
        senderId: number,
        content: string,
        _attachments: unknown,
        messageType: string,
        metadata: unknown,
      ) => ({
        id: 1,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: messageType,
        metadata,
        is_read: false,
        created_at: new Date(),
      }),
    ),
    toMessageDTO: jest.fn((message: Record<string, unknown>) => message),
  },
}));

jest.mock("./utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const ORG = "11111111-1111-4111-8111-111111111111";

//* 帳號
const ORG_ADMIN = 1;
const GA_CONTACT = 2; //* 總務部窗口，上架物品的人（之後離職或異動）
const IT_CONTACT = 3; //* 資訊部窗口，代表資訊部申請
const ORG_MEMBER = 4;
const GA_CONTACT_2 = 7; //* 總務部的另一位窗口，接手的人
const ADMIN_IT_CONTACT = 8; //* Org Admin 兼資訊部窗口
const PLATFORM_ADMIN = 9; //* 全站 role = admin，不是這個組織的成員

const MEMBERSHIP = {
  [ORG_ADMIN]: 101,
  [GA_CONTACT]: 102,
  [IT_CONTACT]: 103,
  [ORG_MEMBER]: 104,
  [GA_CONTACT_2]: 107,
  [ADMIN_IT_CONTACT]: 108,
} as const;

const GENERAL_AFFAIRS = 201;
const IT_DEPT = 202;

/** 一對帳號的對話 id（與 getConversationId 的 mock 相同） */
function conversationOf(a: number, b: number) {
  return Math.min(a, b) * 1000 + Math.max(a, b);
}

//* Socket 推播：記下每一則 (房間, 事件, 內容)
let emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.io = {
      to: (room: string) => ({
        emit: (event: string, payload: Record<string, unknown>) => {
          emitted.push({ room, event, payload });
        },
      }),
    };
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
};

/** 由 userId 在 unitId 上架一件 Internal 物品，回傳 posts.id */
async function listItem(userId = GA_CONTACT, unitId = GENERAL_AFFAIRS) {
  signInAs(userId);
  const res = await api()
    .post(`/api/orgs/${ORG}/items`)
    .send({ ...MONITOR, unitId });
  expect(res.status).toBe(201);
  return fakeDb.posts.find((p) => p.public_id === res.body.item.id)!.id;
}

async function requestAs(
  userId: number,
  postId: number,
  extra: Record<string, unknown> = {},
) {
  signInAs(userId);
  const res = await api()
    .post("/api/weaves")
    .send({ postId, items: [{ itemId: fakeDb.items.find((i) => i.post_id === postId)!.id, quantity: 1 }], ...extra });
  expect(res.status).toBe(201);
  return res.body.weaveId as number;
}

async function setStatus(userId: number, weaveId: number, status: string) {
  signInAs(userId);
  return api().patch(`/api/weaves/${weaveId}/status`).send({ status });
}

async function removeMember(userId: keyof typeof MEMBERSHIP) {
  signInAs(ORG_ADMIN);
  const res = await api().delete(
    `/api/org-admin/orgs/${ORG}/members/${MEMBERSHIP[userId]}`,
  );
  expect(res.status).toBe(204);
}

function weaveRow(weaveId: number) {
  return fakeDb.weaves.find((w) => w.id === weaveId)!;
}

//* 有對話時 requestWeave 會寫系統訊息；系統訊息不在範圍，只濾掉那一行預期的 log，其他錯誤照印
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).startsWith("[requestWeave] System message failed")) return;
    consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  emitted = [];
  const userIds = [
    ORG_ADMIN,
    GA_CONTACT,
    IT_CONTACT,
    ORG_MEMBER,
    GA_CONTACT_2,
    ADMIN_IT_CONTACT,
    PLATFORM_ADMIN,
  ];
  fakeDb = createFakeOrgHandoverDb({
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
      { id: 107, org_id: 10, user_id: GA_CONTACT_2, org_role: "member", access_level: "internal" },
      { id: 108, org_id: 10, user_id: ADMIN_IT_CONTACT, org_role: "admin", access_level: "internal" },
    ],
    units: [
      { id: GENERAL_AFFAIRS, org_id: 10, name: "總務部" },
      { id: IT_DEPT, org_id: 10, name: "資訊部" },
    ],
    unitContacts: [
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 102 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 103 },
      { org_id: 10, org_unit_id: GENERAL_AFFAIRS, membership_id: 107 },
      { org_id: 10, org_unit_id: IT_DEPT, membership_id: 108 },
    ],
  });
});

describe("DELETE /api/org-admin/orgs/:orgId/members/:memberId: the member's open requests", () => {
  it("declines their Requested requests on Internal items and keeps the Approved ones", async () => {
    const postId = await listItem();
    const pending = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    const approved = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    expect((await setStatus(GA_CONTACT, approved, "approved")).status).toBe(200);
    jest.clearAllMocks();

    await removeMember(IT_CONTACT);

    expect(weaveRow(pending).status).toBe("declined");
    expect(weaveRow(approved).status).toBe("approved");
    expect(enqueueSendEmail).toHaveBeenCalledTimes(1);
    expect(enqueueSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: IT_CONTACT,
        action: "declined",
        actorName: "甲公司",
        weaveId: pending,
      }),
    );
  });

  it("keeps their personal request on a Public item, which they can still see", async () => {
    const postId = await listItem();
    fakeDb.posts.find((p) => p.id === postId)!.audience_tier = "public";
    const personal = await requestAs(IT_CONTACT, postId, { actingUnitId: null });
    const onBehalf = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    await removeMember(IT_CONTACT);

    expect(weaveRow(personal).status).toBe("requested");
    //* 代表單位的申請：人已經不代表那個單位了
    expect(weaveRow(onBehalf).status).toBe("declined");
  });

  it("leaves other members' requests and requests on the removed person's own items alone", async () => {
    const postId = await listItem();
    const toRemoved = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    const byOther = await requestAs(ADMIN_IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    await removeMember(GA_CONTACT);

    //* 物品屬於單位：申請仍可由總務部其他窗口或 Org Admin 審核
    expect(weaveRow(toRemoved).status).toBe("requested");
    expect(weaveRow(byOther).status).toBe("requested");
    expect((await setStatus(GA_CONTACT_2, toRemoved, "approved")).status).toBe(200);
  });

  it("declines nothing when the removal is refused", async () => {
    const postId = await listItem(ADMIN_IT_CONTACT);
    const pending = await requestAs(ORG_ADMIN, postId);
    //* 先移除另一位 Org Admin，剩下的 ORG_ADMIN 是最後一位
    await removeMember(ADMIN_IT_CONTACT);

    signInAs(ORG_ADMIN);
    const res = await api().delete(
      `/api/org-admin/orgs/${ORG}/members/${MEMBERSHIP[ORG_ADMIN]}`,
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORG_LAST_ADMIN");
    expect(weaveRow(pending).status).toBe("requested");
  });
});

describe("PATCH /api/org-admin/orgs/:orgId/members/:memberId: dropping a unit", () => {
  async function setUnits(userId: keyof typeof MEMBERSHIP, unitIds: number[], role = "member") {
    signInAs(ORG_ADMIN);
    const res = await api()
      .patch(`/api/org-admin/orgs/${ORG}/members/${MEMBERSHIP[userId]}`)
      .send({ role, unitIds });
    expect(res.status).toBe(200);
    return res;
  }

  it("declines the Requested requests they made on behalf of that unit and tells the requester", async () => {
    const postId = await listItem();
    const onBehalf = await requestAs(ADMIN_IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    const personal = await requestAs(IT_CONTACT, postId, { actingUnitId: null });
    const approved = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await setStatus(GA_CONTACT, approved, "approved");
    const stillContact = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    jest.clearAllMocks();

    //* Org Admin 兼資訊部窗口不再負責資訊部；資訊部窗口照舊
    const res = await setUnits(ADMIN_IT_CONTACT, [], "admin");

    expect(res.body.member).toMatchObject({ role: "admin", unitIds: [] });
    expect(weaveRow(onBehalf).status).toBe("declined");
    expect(weaveRow(personal).status).toBe("requested");
    expect(weaveRow(approved).status).toBe("approved");
    expect(weaveRow(stillContact).status).toBe("requested");
    expect(enqueueSendEmail).toHaveBeenCalledTimes(1);
    expect(enqueueSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: ADMIN_IT_CONTACT,
        action: "declined",
        actorName: "甲公司",
        weaveId: onBehalf,
      }),
    );
  });

  it("declines nothing when the units stay the same", async () => {
    const postId = await listItem();
    const onBehalf = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });

    await setUnits(IT_CONTACT, [IT_DEPT, GENERAL_AFFAIRS]);

    expect(weaveRow(onBehalf).status).toBe("requested");
  });
});

describe("GET /api/org-admin/orgs/:orgId/handovers: who still handles items they no longer contact for", () => {
  async function pending() {
    signInAs(ORG_ADMIN);
    const res = await api().get(`/api/org-admin/orgs/${ORG}/handovers`);
    expect(res.status).toBe(200);
    return res.body.handovers;
  }

  it("lists a removed contact's items in their unit, with the open Weaves they give", async () => {
    const postId = await listItem();
    await listItem();
    const approved = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await setStatus(GA_CONTACT, approved, "approved");
    await requestAs(ADMIN_IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    const done = await requestAs(ORG_ADMIN, postId);
    await setStatus(GA_CONTACT, done, "declined");

    await removeMember(GA_CONTACT);

    expect(await pending()).toEqual([
      {
        user: { id: publicIdOf(GA_CONTACT), email: "user2@example.com", isMember: false },
        unit: { id: GENERAL_AFFAIRS, name: "總務部" },
        itemCount: 2,
        openWeaveCount: 2,
      },
    ]);
  });

  it("lists a contact who moved to another unit, while they are still a member", async () => {
    await listItem();
    signInAs(ORG_ADMIN);
    await api()
      .patch(`/api/org-admin/orgs/${ORG}/members/${MEMBERSHIP[GA_CONTACT]}`)
      .send({ role: "member", unitIds: [IT_DEPT] });

    expect(await pending()).toEqual([
      expect.objectContaining({
        user: { id: publicIdOf(GA_CONTACT), email: "user2@example.com", isMember: true },
        unit: { id: GENERAL_AFFAIRS, name: "總務部" },
      }),
    ]);
  });

  it("is empty while every handler is a contact of the unit or an Org Admin", async () => {
    await listItem();
    await listItem(ADMIN_IT_CONTACT, GENERAL_AFFAIRS);

    expect(await pending()).toEqual([]);
  });

  it("leaves out items a Platform Admin listed, though they are not a member (ADR 0003)", async () => {
    await listItem(PLATFORM_ADMIN, GENERAL_AFFAIRS);
    await listItem();
    await removeMember(GA_CONTACT);

    expect(await pending()).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: publicIdOf(GA_CONTACT) }),
        itemCount: 1,
      }),
    ]);
  });

  it("is only for Org Admins", async () => {
    signInAs(GA_CONTACT_2);
    const res = await api().get(`/api/org-admin/orgs/${ORG}/handovers`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
  });
});

describe("POST /api/org-admin/orgs/:orgId/handovers: handing items to another contact", () => {
  async function handOver(body: Record<string, unknown>, as = ORG_ADMIN) {
    signInAs(as);
    return api().post(`/api/org-admin/orgs/${ORG}/handovers`).send(body);
  }

  const TO_GA_CONTACT_2 = {
    fromUserId: publicIdOf(GA_CONTACT),
    unitId: GENERAL_AFFAIRS,
    toMemberId: MEMBERSHIP[GA_CONTACT_2],
  };

  it("lets the new contact carry on an Approved Weave in their own conversation", async () => {
    const postId = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await setStatus(GA_CONTACT, weaveId, "approved");
    expect(weaveRow(weaveId).conversation_id).toBe(conversationOf(GA_CONTACT, IT_CONTACT));
    await removeMember(GA_CONTACT);

    const res = await handOver(TO_GA_CONTACT_2);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: 1, weaves: 1 });
    expect(messageService.getConversationId).toHaveBeenLastCalledWith(
      GA_CONTACT_2,
      IT_CONTACT,
      { orgId: 10, orgUserId: GA_CONTACT_2 },
      expect.anything(),
    );
    expect(weaveRow(weaveId)).toMatchObject({
      giver_id: GA_CONTACT_2,
      receiver_id: IT_CONTACT,
      receiver_org_unit_id: IT_DEPT,
      conversation_id: conversationOf(GA_CONTACT_2, IT_CONTACT),
    });

    //* 新窗口看得到這筆 Weave、能確認交接；原窗口不再是這筆 Weave 的一方
    signInAs(GA_CONTACT_2);
    expect((await api().get(`/api/weaves/${weaveId}`)).status).toBe(200);
    expect((await setStatus(GA_CONTACT, weaveId, "completed")).status).toBe(403);
    expect((await setStatus(GA_CONTACT_2, weaveId, "completed")).status).toBe(200);
    expect((await setStatus(IT_CONTACT, weaveId, "completed")).body.fullyCompleted).toBe(true);
  });

  it("tells both conversations about the handover and points each to the other", async () => {
    const postId = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await setStatus(GA_CONTACT, weaveId, "approved");
    await removeMember(GA_CONTACT);
    const oldConversation = conversationOf(GA_CONTACT, IT_CONTACT);
    const newConversation = conversationOf(GA_CONTACT_2, IT_CONTACT);
    jest.clearAllMocks();
    emitted = [];

    expect((await handOver(TO_GA_CONTACT_2)).status).toBe(200);

    const calls = (messageService.createMessage as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    //* 原對話：原窗口名下，告訴申請人去新的對話
    expect(calls[0].slice(0, 6)).toEqual([
      oldConversation,
      GA_CONTACT,
      expect.any(String),
      undefined,
      "system_handover",
      {
        handover: "moved_out",
        weave_id: weaveId,
        post_id: postId,
        item_title: MONITOR.title,
        other_conversation_id: newConversation,
      },
    ]);
    //* 新對話：新窗口名下，連回先前的對話
    expect(calls[1].slice(0, 6)).toEqual([
      newConversation,
      GA_CONTACT_2,
      expect.any(String),
      undefined,
      "system_handover",
      {
        handover: "moved_in",
        weave_id: weaveId,
        post_id: postId,
        item_title: MONITOR.title,
        other_conversation_id: oldConversation,
      },
    ]);
    //* 跟交接的其他寫入在同一個交易：用交易的連線，不另開
    expect(calls[0][6]).toBeDefined();
    expect((messageService.getConversationId as jest.Mock).mock.calls[0][3]).toBe(calls[0][6]);

    //* 兩個對話的參與者都即時收到
    const rooms = emitted
      .filter((e) => e.event === "new_message")
      .map((e) => `${e.room}:${e.payload.conversation_id}`);
    expect(rooms.sort()).toEqual(
      [
        `user_${GA_CONTACT}:${oldConversation}`,
        `user_${IT_CONTACT}:${oldConversation}`,
        `user_${GA_CONTACT_2}:${newConversation}`,
        `user_${IT_CONTACT}:${newConversation}`,
      ].sort(),
    );
  });

  it("notifies the new contact of the items and requests they took over", async () => {
    const postId = await listItem();
    await listItem();
    await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await removeMember(GA_CONTACT);
    jest.clearAllMocks();

    await handOver(TO_GA_CONTACT_2);

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: GA_CONTACT_2,
        sender_id: null,
        type: "ORG_HANDOVER",
        params: { unitName: "總務部", itemCount: "2", weaveCount: "1" },
        link: "/org/items",
      }),
    );
  });

  it("changes nothing when moving a conversation fails", async () => {
    const postId = await listItem();
    const weaveId = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await removeMember(GA_CONTACT);
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    (messageService.getConversationId as jest.Mock).mockRejectedValueOnce(new Error("db down"));

    const res = await handOver(TO_GA_CONTACT_2);

    expect(res.status).toBe(500);
    expect(fakeDb.posts.find((p) => p.id === postId)!.user_id).toBe(GA_CONTACT);
    expect(weaveRow(weaveId)).toMatchObject({
      giver_id: GA_CONTACT,
      conversation_id: conversationOf(GA_CONTACT, IT_CONTACT),
    });
    expect(fakeDb.handoverEvents).toEqual([]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("makes the new contact the handler a requester's later messages reach", async () => {
    const postId = await listItem();
    await removeMember(GA_CONTACT);

    await handOver(TO_GA_CONTACT_2);

    //* 私訊與新申請都送給 posts.user_id（經手人）
    expect(fakeDb.posts.find((p) => p.id === postId)!.user_id).toBe(GA_CONTACT_2);
    const weaveId = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    expect(weaveRow(weaveId).giver_id).toBe(GA_CONTACT_2);
    //* 申請人的「撤回」仍只屬於申請人：接手的人不會被當成申請人
    expect((await setStatus(GA_CONTACT_2, weaveId, "withdrawn")).status).toBe(403);
  });

  it("keeps finished Weaves with the original contact and records who handed over what", async () => {
    const postId = await listItem();
    const declined = await requestAs(ORG_ADMIN, postId);
    await setStatus(GA_CONTACT, declined, "declined");
    const open = await requestAs(IT_CONTACT, postId, { actingUnitId: IT_DEPT });
    await removeMember(GA_CONTACT);

    await handOver(TO_GA_CONTACT_2);

    expect(weaveRow(declined).giver_id).toBe(GA_CONTACT);
    expect(fakeDb.handoverEvents).toEqual([
      expect.objectContaining({ post_id: postId, weave_id: null, from_user_id: GA_CONTACT, to_user_id: GA_CONTACT_2, operator_user_id: ORG_ADMIN, org_unit_id: GENERAL_AFFAIRS }),
      expect.objectContaining({ post_id: postId, weave_id: open, from_user_id: GA_CONTACT, to_user_id: GA_CONTACT_2, operator_user_id: ORG_ADMIN }),
    ]);
  });

  it("only moves the items of that unit", async () => {
    signInAs(ORG_ADMIN);
    await api()
      .patch(`/api/org-admin/orgs/${ORG}/members/${MEMBERSHIP[GA_CONTACT]}`)
      .send({ role: "member", unitIds: [GENERAL_AFFAIRS, IT_DEPT] });
    const gaItem = await listItem();
    const itItem = await listItem(GA_CONTACT, IT_DEPT);

    await handOver(TO_GA_CONTACT_2);

    expect(fakeDb.posts.find((p) => p.id === gaItem)!.user_id).toBe(GA_CONTACT_2);
    expect(fakeDb.posts.find((p) => p.id === itItem)!.user_id).toBe(GA_CONTACT);
  });

  it("refuses a new handler who requested one of the items, and changes nothing", async () => {
    const postId = await listItem();
    const weaveId = await requestAs(GA_CONTACT_2, postId);
    await removeMember(GA_CONTACT);

    const res = await handOver(TO_GA_CONTACT_2);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORG_HANDOVER_TARGET_IS_REQUESTER");
    expect(weaveRow(weaveId).giver_id).toBe(GA_CONTACT);
    expect(fakeDb.posts.find((p) => p.id === postId)!.user_id).toBe(GA_CONTACT);
    expect(fakeDb.handoverEvents).toEqual([]);
  });

  it.each([
    ["a member who is not a contact of the unit", { toMemberId: MEMBERSHIP[IT_CONTACT] }],
    ["the person handing over", { toMemberId: MEMBERSHIP[GA_CONTACT] }],
    ["an unknown handler", { fromUserId: publicIdOf(999) }],
    ["a malformed body", { unitId: "總務部" }],
  ])("rejects %s with INVALID_REQUEST", async (_what, override) => {
    const postId = await listItem();

    const res = await handOver({ ...TO_GA_CONTACT_2, ...override });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(fakeDb.posts.find((p) => p.id === postId)!.user_id).toBe(GA_CONTACT);
  });

  it("is only for Org Admins", async () => {
    const postId = await listItem();

    const res = await handOver(TO_GA_CONTACT_2, GA_CONTACT_2);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORG_NOT_FOUND");
    expect(fakeDb.posts.find((p) => p.id === postId)!.user_id).toBe(GA_CONTACT);
  });
});
