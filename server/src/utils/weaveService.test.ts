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

function setupDb(postType: PostType, status: WeaveStatus) {
  const row = weaveRow(postType, status);
  (dbPool.getConnection as jest.Mock).mockResolvedValue(connection);
  connection.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FOR UPDATE")) return [[row]];
    if (sql.includes("giver_confirmed, receiver_confirmed"))
      return [[{ giver_confirmed: 1, receiver_confirmed: 1 }]];
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

function run(
  actor: Actor,
  newStatus: WeaveStatus,
  io: never | null = null,
) {
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

  it.each(cases)("%s | %s | %s -> %s", async (postType, status, actor, target) => {
    setupDb(postType, status);
    const want = expected(status, actor, target);
    if (want === 200) {
      await expect(run(actor, target)).resolves.toBeDefined();
    } else {
      const err = await run(actor, target).catch((e) => e);
      expect(err).toBeInstanceOf(WeaveError);
      expect((err as WeaveError).httpStatus).toBe(want);
    }
  });
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
