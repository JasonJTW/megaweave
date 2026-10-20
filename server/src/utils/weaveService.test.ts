import dbPool from "./db";
import { createNotification } from "./notificationService";
import { approveWeave, WeaveError, type WeaveStatus } from "./weaveService";

jest.mock("./db", () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));
jest.mock("./notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(true),
}));
jest.mock("./messageService", () => ({ messageService: {} }));
jest.mock("./updateUserStats", () => ({
  updateUserStats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../queue/queues", () => ({
  enqueueSendEmail: jest.fn().mockResolvedValue(true),
}));

const AUTHOR = 1;
const INITIATOR = 2;
const STRANGER = 3;

type PostType = "share" | "wish";
type Actor = "author" | "initiator" | "stranger";

const ACTOR_IDS: Record<Actor, number> = {
  author: AUTHOR,
  initiator: INITIATOR,
  stranger: STRANGER,
};

const ALL_STATUSES: WeaveStatus[] = [
  "requested",
  "approved",
  "completed",
  "declined",
  "cancelled",
  "withdrawn",
];

// ADR 0001: Giver/Receiver follow item direction.
// Share: author gives. Wish: initiator gives.
function weaveRow(postType: PostType, status: WeaveStatus) {
  const authorIsGiver = postType === "share";
  return {
    id: 10,
    post_id: 100,
    giver_id: authorIsGiver ? AUTHOR : INITIATOR,
    receiver_id: authorIsGiver ? INITIATOR : AUTHOR,
    post_author_id: AUTHOR,
    post_type: postType,
    status,
    giver_confirmed: 0,
    receiver_confirmed: 0,
  };
}

const connection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  execute: jest.fn(),
};

interface DbOptions {
  /** weave_items 請求數量 vs items 現有庫存；省略代表 All-items weave */
  stock?: { requested: number; available: number };
  /** 對方是否已確認（false → 本次為單邊確認） */
  bothConfirmed?: boolean;
}

function setupDb(
  postType: PostType,
  status: WeaveStatus,
  { stock, bothConfirmed = true }: DbOptions = {},
) {
  const row = weaveRow(postType, status);
  (dbPool.getConnection as jest.Mock).mockResolvedValue(connection);
  connection.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM weave_items"))
      return [stock ? [{ item_id: 500, quantity: stock.requested }] : []];
    if (sql.includes("FROM items"))
      return [
        stock ? [{ id: 500, title: "Bottle", quantity: stock.available }] : [],
      ];
    if (sql.includes("FOR UPDATE")) return [[row]];
    if (sql.includes("giver_confirmed, receiver_confirmed"))
      return [
        [
          bothConfirmed
            ? { giver_confirmed: 1, receiver_confirmed: 1 }
            : { giver_confirmed: 1, receiver_confirmed: 0 },
        ],
      ];
    return [[]];
  });
  (dbPool.execute as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes("FROM posts")) return [[{ title: "Crib" }]];
    if (sql.includes("FROM users"))
      return [[{ username: "u", email: "u@example.com" }]];
    if (sql.includes("SELECT status")) return [[{ status }]];
    return [[]];
  });
}

function fakeIo() {
  return { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never;
}

function run(actor: Actor, newStatus: WeaveStatus, io: never | null = null) {
  return approveWeave(
    {
      weaveId: "10",
      newStatus,
      userId: ACTOR_IDS[actor],
      actorName: "Actor",
    },
    io,
  );
}

// Expected HTTP outcome per the #48 transition table.
function expected(
  status: WeaveStatus,
  actor: Actor,
  target: WeaveStatus,
): 200 | 400 | 403 {
  if (status !== "requested" && status !== "approved") return 400;
  if (actor === "stranger") return 403;
  if (status === "requested") {
    if (target === "approved" || target === "declined")
      return actor === "author" ? 200 : 403;
    if (target === "withdrawn") return actor === "initiator" ? 200 : 403;
    return 400;
  }
  if (target === "cancelled" || target === "completed") return 200;
  return 400;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("approveWeave authorization (first test)", () => {
  it("Wish: Initiator approving their own request gets 403", async () => {
    setupDb("wish", "requested");
    await expect(run("initiator", "approved")).rejects.toMatchObject({
      httpStatus: 403,
    });
    expect(connection.rollback).toHaveBeenCalled();
  });
});

describe("approveWeave state machine (table-driven)", () => {
  const cases: Array<[PostType, WeaveStatus, Actor, WeaveStatus]> = [];
  for (const postType of ["share", "wish"] as PostType[])
    for (const status of ALL_STATUSES)
      for (const actor of ["author", "initiator", "stranger"] as Actor[])
        for (const target of ALL_STATUSES)
          cases.push([postType, status, actor, target]);

  it.each(cases)(
    "%s | %s | %s -> %s",
    async (postType, status, actor, target) => {
      setupDb(postType, status);
      const want = expected(status, actor, target);
      if (want === 200) {
        await expect(run(actor, target)).resolves.toBeDefined();
      } else {
        const err = await run(actor, target).catch((e) => e);
        expect(err).toBeInstanceOf(WeaveError);
        expect((err as WeaveError).httpStatus).toBe(want);
      }
    },
  );
});

describe("approveWeave notifications", () => {
  const titles = () =>
    (createNotification as jest.Mock).mock.calls.map((c) => c[1].title);
  const recipients = () =>
    (createNotification as jest.Mock).mock.calls.map((c) => c[1].recipient_id);

  it("withdraw notifies the Post Author with a withdrawn notice", async () => {
    setupDb("wish", "requested");
    await run("initiator", "withdrawn", fakeIo());
    expect(titles()).toEqual(["Weave Request Withdrawn"]);
    expect(recipients()).toEqual([AUTHOR]);
  });

  it("cancel in Approved stage sends the cancelled notice", async () => {
    setupDb("wish", "approved");
    await run("author", "cancelled", fakeIo());
    expect(titles()).toEqual(["Weave Cancelled"]);
    expect(recipients()).toEqual([INITIATOR]);
  });

  it("decline notifies the Initiator", async () => {
    setupDb("wish", "requested");
    await run("author", "declined", fakeIo());
    expect(titles()).toEqual(["Weave Request Declined"]);
    expect(recipients()).toEqual([INITIATOR]);
  });
});

// Holding the transaction connection while borrowing another from dbPool
// deadlocks the pool once concurrent callers >= connectionLimit.
describe("approveWeave pool usage", () => {
  function expectReleasedBeforePoolQueries() {
    const releaseOrder = connection.release.mock.invocationCallOrder;
    const poolOrders = (dbPool.execute as jest.Mock).mock.invocationCallOrder;
    expect(releaseOrder).toHaveLength(1);
    expect(poolOrders.length).toBeGreaterThan(0);
    expect(Math.min(...poolOrders)).toBeGreaterThan(releaseOrder[0]);
  }

  it("final confirm releases its connection before post-commit queries", async () => {
    setupDb("share", "approved");
    await run("author", "completed", fakeIo());
    expectReleasedBeforePoolQueries();
  });

  it("partial confirm releases its connection before post-commit queries", async () => {
    setupDb("share", "approved", { bothConfirmed: false });
    await run("author", "completed", fakeIo());
    expectReleasedBeforePoolQueries();
  });
});

// The confirmation is already committed; a failed follow-up lookup must not
// turn it into an error response the user would read as "not saved".
describe("approveWeave post-commit failures", () => {
  it("partial confirm still succeeds when the post-commit lookup fails", async () => {
    setupDb("share", "approved", { bothConfirmed: false });
    (dbPool.execute as jest.Mock).mockRejectedValue(new Error("db down"));
    await expect(run("author", "completed")).resolves.toEqual({
      newStatus: "approved",
      fullyCompleted: false,
    });
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});

describe("approveWeave inventory checks", () => {
  const sqls = () => connection.execute.mock.calls.map((c) => c[0] as string);
  const deducted = () =>
    sqls().some((q) => q.includes("UPDATE items SET quantity = quantity - ?"));

  it("approve (requested -> approved) rejects when stock is already short", async () => {
    setupDb("share", "requested", { stock: { requested: 3, available: 2 } });
    await expect(run("author", "approved")).rejects.toMatchObject({
      httpStatus: 400,
    });
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it("partial confirm rejects early when stock is short, without deducting", async () => {
    setupDb("share", "approved", {
      stock: { requested: 3, available: 2 },
      bothConfirmed: false,
    });
    await expect(run("author", "completed")).rejects.toMatchObject({
      httpStatus: 400,
    });
    expect(deducted()).toBe(false);
    expect(connection.rollback).toHaveBeenCalled();
  });

  it("final confirm locks items FOR UPDATE and deducts when stock is enough", async () => {
    setupDb("share", "approved", { stock: { requested: 2, available: 2 } });
    await expect(run("author", "completed")).resolves.toMatchObject({
      fullyCompleted: true,
    });
    const lockIdx = sqls().findIndex(
      (q) => q.includes("FROM items") && q.includes("FOR UPDATE"),
    );
    const deductIdx = sqls().findIndex((q) =>
      q.includes("UPDATE items SET quantity = quantity - ?"),
    );
    expect(lockIdx).toBeGreaterThan(-1);
    expect(deductIdx).toBeGreaterThan(lockIdx);
    expect(connection.commit).toHaveBeenCalled();
  });

  it("final confirm with insufficient stock rolls back and stays approved", async () => {
    setupDb("share", "approved", { stock: { requested: 3, available: 2 } });
    const err = await run("author", "completed").catch((e) => e);
    expect(err).toBeInstanceOf(WeaveError);
    expect((err as WeaveError).httpStatus).toBe(400);
    expect(deducted()).toBe(false);
    expect(sqls().some((q) => q.includes("SET status = 'completed'"))).toBe(
      false,
    );
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
