/**
 * Weave module 對真的 MySQL：狀態機（CONTEXT.md「Weave 狀態」）、角色（ADR 0001/0003）、
 * 庫存、組織流轉紀錄、系統婉拒，以及讀取模型附上的 viewer。
 * 只 mock 出站的副作用（站內通知、Email 佇列、統計重算）
 */
import type { RowDataPacket } from "mysql2/promise";
import type { Server } from "socket.io";
import dbPool from "../../utils/db";
import { closeDatabase, resetDb } from "../../testUtils/db/reset";
import {
  addMember,
  createOrg,
  createPost,
  createUnit,
  createUser,
  type TestPost,
  type TestUser,
} from "../../testUtils/db/fixtures";
import { createNotification } from "../../utils/notificationService";
import {
  actOnWeave,
  commandForTargetStatus,
  declineAsSystem,
  processWeaveRows,
  requestWeave,
  WEAVE_QUERY_BASE,
  WeaveError,
  type WeaveOutput,
  type WeaveStatus,
} from ".";

jest.mock("../../utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../queue/queues", () => ({
  enqueueSendEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));

const emits: Array<{ room: string; event: string; payload: unknown }> = [];
const io = {
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
  }),
} as unknown as Server;

const ALL_STATUSES: WeaveStatus[] = [
  "requested",
  "approved",
  "declined",
  "withdrawn",
  "cancelled",
  "completed",
];

beforeAll(resetDb);
beforeEach(() => {
  jest.clearAllMocks();
  emits.length = 0;
});
afterAll(closeDatabase);

async function seedWeave(
  post: TestPost,
  giver: TestUser,
  receiver: TestUser,
  {
    status = "requested",
    quantity = 1,
    receiverUnitId = null,
  }: { status?: WeaveStatus; quantity?: number; receiverUnitId?: number | null } = {},
): Promise<number> {
  const [result] = await dbPool.execute<import("mysql2").ResultSetHeader>(
    "INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, status) VALUES (?, ?, ?, ?, ?)",
    [post.id, giver.id, receiver.id, receiverUnitId, status],
  );
  await dbPool.execute("INSERT INTO weave_items (weave_id, item_id, quantity) VALUES (?, ?, ?)", [
    result.insertId,
    post.itemIds[0],
    quantity,
  ]);
  return result.insertId;
}

async function weaveRow(id: number) {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT status, giver_confirmed, receiver_confirmed FROM weaves WHERE id = ?",
    [id],
  );
  return rows[0];
}

async function stock(itemId: number) {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT quantity, reserved_quantity FROM items WHERE id = ?",
    [itemId],
  );
  return { quantity: Number(rows[0].quantity), reserved: Number(rows[0].reserved_quantity) };
}

function act(weaveId: number, user: TestUser, target: WeaveStatus) {
  return actOnWeave(
    { weaveId, command: commandForTargetStatus(target), actor: { id: user.id, name: user.name } },
    io,
  );
}

/** 一則個人 Post 與它的兩造：Share 的 Post Author 是 Giver，Wish 的 Post Author 是 Receiver（ADR 0001） */
async function personalWeave(type: "share" | "wish", status: WeaveStatus) {
  const author = await createUser("author");
  const initiator = await createUser("initiator");
  const stranger = await createUser("stranger");
  const post = await createPost(author, { type, items: [{ title: "Chair", quantity: 5 }] });
  const [giver, receiver] = type === "share" ? [author, initiator] : [initiator, author];
  if (status === "approved") {
    await dbPool.execute("UPDATE items SET reserved_quantity = 1 WHERE id = ?", [post.itemIds[0]]);
  }
  const weaveId = await seedWeave(post, giver, receiver, { status });
  return { author, initiator, stranger, post, giver, receiver, weaveId };
}

// Expected outcome per the #48 transition table.
function expected(status: WeaveStatus, actor: string, target: WeaveStatus): 200 | 400 | 403 {
  if (status !== "requested" && status !== "approved") return 400;
  if (actor === "stranger") return 403;
  if (status === "requested") {
    if (target === "approved" || target === "declined") return actor === "author" ? 200 : 403;
    if (target === "withdrawn") return actor === "initiator" ? 200 : 403;
    return 400;
  }
  if (target === "cancelled" || target === "completed") return 200;
  return 400;
}

describe("state machine (table-driven)", () => {
  const cases: Array<["share" | "wish", WeaveStatus, "author" | "initiator" | "stranger", WeaveStatus]> =
    [];
  for (const type of ["share", "wish"] as const)
    for (const status of ALL_STATUSES)
      for (const actor of ["author", "initiator", "stranger"] as const)
        for (const target of ALL_STATUSES) cases.push([type, status, actor, target]);

  it.each(cases)("%s | %s | %s -> %s", async (type, status, actor, target) => {
    const w = await personalWeave(type, status);
    const want = expected(status, actor, target);
    const result = await act(w.weaveId, w[actor], target).catch((e: unknown) => e);
    if (want === 200) {
      expect(result).not.toBeInstanceOf(Error);
      //* 單方確認不改狀態
      const after = target === "completed" ? "approved" : target;
      expect((await weaveRow(w.weaveId)).status).toBe(after);
    } else {
      expect(result).toBeInstanceOf(WeaveError);
      expect((result as WeaveError).httpStatus).toBe(want);
      expect((await weaveRow(w.weaveId)).status).toBe(status);
    }
  });
});

describe("inventory", () => {
  it("approve reserves the requested quantity", async () => {
    const w = await personalWeave("share", "requested");
    await act(w.weaveId, w.author, "approved");
    expect(await stock(w.post.itemIds[0])).toEqual({ quantity: 5, reserved: 1 });
  });

  it("approve fails and stays requested when other approved weaves hold the stock", async () => {
    const w = await personalWeave("share", "requested");
    await dbPool.execute("UPDATE items SET reserved_quantity = 5 WHERE id = ?", [w.post.itemIds[0]]);
    await expect(act(w.weaveId, w.author, "approved")).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
    expect((await weaveRow(w.weaveId)).status).toBe("requested");
    expect(await stock(w.post.itemIds[0])).toEqual({ quantity: 5, reserved: 5 });
  });

  it("cancel releases the reservation", async () => {
    const w = await personalWeave("share", "approved");
    await act(w.weaveId, w.initiator, "cancelled");
    expect(await stock(w.post.itemIds[0])).toEqual({ quantity: 5, reserved: 0 });
  });

  it("both confirms complete the weave and deduct the stock once", async () => {
    const w = await personalWeave("share", "approved");
    await expect(act(w.weaveId, w.giver, "completed")).resolves.toEqual({
      newStatus: "approved",
      fullyCompleted: false,
    });
    expect(await stock(w.post.itemIds[0])).toEqual({ quantity: 5, reserved: 1 });
    await expect(act(w.weaveId, w.receiver, "completed")).resolves.toEqual({
      newStatus: "completed",
      fullyCompleted: true,
    });
    expect(await weaveRow(w.weaveId)).toMatchObject({
      status: "completed",
      giver_confirmed: true,
      receiver_confirmed: true,
    });
    expect(await stock(w.post.itemIds[0])).toEqual({ quantity: 4, reserved: 0 });
  });

  it("the final confirm rolls back and stays approved when the stock shrank after approval", async () => {
    const w = await personalWeave("share", "approved");
    await act(w.weaveId, w.giver, "completed");
    await dbPool.execute("UPDATE items SET quantity = 0 WHERE id = ?", [w.post.itemIds[0]]);
    await expect(act(w.weaveId, w.receiver, "completed")).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
    expect(await weaveRow(w.weaveId)).toMatchObject({ status: "approved", receiver_confirmed: false });
  });
});

describe("notifications and push", () => {
  const recipients = () =>
    (createNotification as jest.Mock).mock.calls.map((c) => [c[1].recipient_id, c[1].type]);

  it("withdraw notifies the Post Author", async () => {
    const w = await personalWeave("share", "requested");
    await act(w.weaveId, w.initiator, "withdrawn");
    expect(recipients()).toEqual([[w.author.id, "WEAVE_WITHDRAWN"]]);
  });

  it("a partial confirm tells the other party it is waiting for them", async () => {
    const w = await personalWeave("wish", "approved");
    await act(w.weaveId, w.receiver, "completed");
    expect(recipients()).toEqual([[w.giver.id, "WEAVE_CONFIRMED"]]);
  });

  it("the final confirm sends the completed notice to both parties", async () => {
    const w = await personalWeave("share", "approved");
    await act(w.weaveId, w.giver, "completed");
    jest.clearAllMocks();
    await act(w.weaveId, w.receiver, "completed");
    expect(recipients()).toEqual([
      [w.giver.id, "WEAVE_COMPLETED"],
      [w.receiver.id, "WEAVE_COMPLETED"],
    ]);
  });

  it("pushes one weave_status_updated payload shape to both parties", async () => {
    const w = await personalWeave("share", "requested");
    await act(w.weaveId, w.author, "approved");
    const payload = {
      weaveId: w.weaveId,
      status: "approved",
      giver_confirmed: false,
      receiver_confirmed: false,
    };
    expect(emits).toEqual(
      expect.arrayContaining([
        { room: `user_${w.giver.id}`, event: "weave_status_updated", payload },
        { room: `user_${w.receiver.id}`, event: "weave_status_updated", payload },
      ]),
    );
  });
});

describe("org posts (ADR 0003/0004)", () => {
  async function orgWeave() {
    const org = await createOrg("Acme");
    const unit = await createUnit(org, "IT");
    const lister = await createUser("lister");
    const otherContact = await createUser("contact");
    const admin = await createUser("orgadmin");
    const member = await createUser("member");
    const requester = await createUser("requester");
    const platformAdmin = await createUser("platform", { role: "admin" });
    await addMember(org, lister, { contactOf: [unit] });
    await addMember(org, otherContact, { contactOf: [unit] });
    await addMember(org, admin, { admin: true });
    await addMember(org, member);
    await addMember(org, requester);
    const post = await createPost(lister, {
      org: { orgId: org.id, unitId: unit },
      audienceTier: "members",
      items: [{ title: "Monitor", quantity: 3 }],
    });
    const weaveId = await seedWeave(post, lister, requester);
    return { org, unit, lister, otherContact, admin, member, requester, platformAdmin, post, weaveId };
  }

  async function events(weaveId: number) {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT action, actor_user_id FROM org_weave_events WHERE weave_id = ? ORDER BY id",
      [weaveId],
    );
    return rows.map((r) => [r.action, r.actor_user_id == null ? null : Number(r.actor_user_id)]);
  }

  it.each(["otherContact", "admin", "platformAdmin"] as const)(
    "%s may approve although they are not a party, and the event records them",
    async (who) => {
      const w = await orgWeave();
      await act(w.weaveId, w[who], "approved");
      expect((await weaveRow(w.weaveId)).status).toBe("approved");
      expect(await events(w.weaveId)).toEqual([["approved", w[who].id]]);
    },
  );

  it.each(["member", "requester"] as const)("%s may not approve", async (who) => {
    const w = await orgWeave();
    await expect(act(w.weaveId, w[who], "approved")).rejects.toMatchObject({ httpStatus: 403 });
    expect(await events(w.weaveId)).toEqual([]);
  });

  it("declineAsSystem declines only requests still Requested, with no actor", async () => {
    const w = await orgWeave();
    const approved = await seedWeave(w.post, w.lister, w.member, { status: "approved" });
    const weaves = [w.weaveId, approved].map((id) => ({
      id,
      postId: w.post.id,
      giverId: w.lister.id,
      receiverId: w.requester.id,
    }));
    await declineAsSystem(dbPool, w.org.id, weaves);
    expect((await weaveRow(w.weaveId)).status).toBe("declined");
    expect((await weaveRow(approved)).status).toBe("approved");
    expect(await events(w.weaveId)).toEqual([["declined", null]]);
  });
});

describe("requestWeave", () => {
  const initiatorOf = (user: TestUser) => ({ id: user.id, name: user.name, publicId: user.publicId });

  it.each([
    ["share", "receiver"],
    ["wish", "giver"],
  ] as const)("on a %s the Initiator is the %s and items are written with the weave", async (type, side) => {
    const author = await createUser("author");
    const initiator = await createUser("initiator");
    const post = await createPost(author, { type, items: [{ title: "Lamp", quantity: 2 }] });
    const { weaveId } = await requestWeave(
      { postId: post.id, items: [{ itemId: post.itemIds[0], quantity: 2 }], initiator: initiatorOf(initiator) },
      io,
    );
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT w.giver_id, w.receiver_id, w.status, wi.item_id, wi.quantity FROM weaves w JOIN weave_items wi ON wi.weave_id = w.id WHERE w.id = ?",
      [weaveId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0][`${side}_id`])).toBe(initiator.id);
    expect(rows[0]).toMatchObject({ status: "requested", quantity: 2 });
  });

  it("returns 404 and writes nothing for an org post the initiator cannot see", async () => {
    const org = await createOrg("Hidden");
    const unit = await createUnit(org, "Ops");
    const lister = await createUser("lister");
    await addMember(org, lister, { contactOf: [unit] });
    const outsider = await createUser("outsider");
    const post = await createPost(lister, { org: { orgId: org.id, unitId: unit }, audienceTier: "internal" });
    await expect(
      requestWeave(
        { postId: post.id, items: [{ itemId: post.itemIds[0], quantity: 1 }], initiator: initiatorOf(outsider) },
        io,
      ),
    ).rejects.toMatchObject({ httpStatus: 404, code: "POST_NOT_FOUND" });
    const [rows] = await dbPool.execute<RowDataPacket[]>("SELECT id FROM weaves WHERE post_id = ?", [post.id]);
    expect(rows).toHaveLength(0);
  });
});

describe("read model viewer", () => {
  async function viewerOf(weaveId: number, user: TestUser) {
    const [rows] = await dbPool.execute<WeaveOutput[]>(`${WEAVE_QUERY_BASE} WHERE w.id = ? GROUP BY w.id`, [
      weaveId,
    ]);
    const [weave] = await processWeaveRows(rows, { viewerUserId: user.id });
    return weave.viewer;
  }

  it("gives the Reviewer approve/decline and the Initiator withdraw while Requested", async () => {
    const w = await personalWeave("wish", "requested");
    await expect(viewerOf(w.weaveId, w.author)).resolves.toEqual({
      role: "receiver",
      isInitiator: false,
      isReviewer: true,
      commands: ["approve", "decline"],
    });
    await expect(viewerOf(w.weaveId, w.initiator)).resolves.toEqual({
      role: "giver",
      isInitiator: true,
      isReviewer: false,
      commands: ["withdraw"],
    });
  });

  it("drops confirm once the viewer confirmed their own side", async () => {
    const w = await personalWeave("share", "approved");
    await act(w.weaveId, w.giver, "completed");
    await expect(viewerOf(w.weaveId, w.giver)).resolves.toMatchObject({ commands: ["cancel"] });
    await expect(viewerOf(w.weaveId, w.receiver)).resolves.toMatchObject({
      commands: ["cancel", "confirm"],
    });
  });

  it("is left out when there is no viewer (public profile)", async () => {
    const w = await personalWeave("share", "requested");
    const [rows] = await dbPool.execute<WeaveOutput[]>(`${WEAVE_QUERY_BASE} WHERE w.id = ? GROUP BY w.id`, [
      w.weaveId,
    ]);
    const [weave] = await processWeaveRows(rows, { includeReceiverOrgUnit: false });
    expect(weave.viewer).toBeUndefined();
  });
});
