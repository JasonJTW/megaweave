// like.test.ts
import express from "express";
import request from "supertest";
import likeRouter from "./like";
import { createNotification } from "./utils/notificationService";
import { enqueueUserVectorUpdate } from "./queue/queues";

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    getConnection: async () => mockDb.makeConnection(),
    execute: async (sql: string, params: unknown[]) =>
      mockDb.poolExecute(sql, params),
  },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (
    req: { header: (n: string) => string | undefined; user?: unknown },
    res: {
      status: (c: number) => { json: (b: unknown) => unknown };
    },
    next: () => void,
  ) => {
    const raw = req.header("x-test-user");
    if (!raw) return res.status(401).json({ errorMessage: "Please login first" });
    req.user = JSON.parse(raw);
    next();
  },
}));

jest.mock("./utils/notificationService", () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./queue/queues", () => ({
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// In-memory fake of the MySQL pieces like.ts touches.
//
// Modelled InnoDB behaviour that the race tests depend on:
//   - UNIQUE(user_id, post_id): a second INSERT throws ER_DUP_ENTRY
//   - DELETE of an already-deleted row succeeds with affectedRows = 0
//   - plain SELECT is a non-locking read; `SELECT ... FOR UPDATE` blocks until
//     the holder commits / rolls back (per-post-row lock)
//   - rollback undoes this connection's writes
//   - every statement takes a few ms, so concurrent requests really interleave
//     statement by statement (otherwise the race can never occur)
//
// Unknown SQL throws, so a query change forces the fake (and thus the review of
// these semantics) to be updated instead of silently passing.
// ---------------------------------------------------------------------------
type FakePost = {
  id: number;
  user_id: number;
  public_id: string;
  title: string;
  likes_count: number;
};

// Per-statement latency: long enough that parallel HTTP requests overlap
// (supertest opens a server per request, so setImmediate alone lets them run
// back to back and the race never shows up).
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

class FakeDb {
  posts = new Map<string, FakePost>();
  likes = new Set<string>(); // `${userId}:${postId}`
  released = 0;
  failOn: ((sql: string) => boolean) | null = null;
  private lockTails = new Map<number, Promise<void>>();

  addPost(post: FakePost) {
    this.posts.set(post.public_id, post);
  }

  likeRows(postId: number) {
    return [...this.likes].filter((k) => k.endsWith(`:${postId}`)).length;
  }

  private async acquire(postId: number): Promise<() => void> {
    const prev = this.lockTails.get(postId) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    this.lockTails.set(
      postId,
      prev.then(() => mine),
    );
    await prev;
    return release;
  }

  makeConnection() {
    const undo: Array<() => void> = [];
    const held: Array<() => void> = [];
    const releaseLocks = () => held.splice(0).forEach((release) => release());

    return {
      beginTransaction: async () => {},
      commit: async () => {
        undo.length = 0;
        releaseLocks();
      },
      rollback: async () => {
        undo.splice(0).reverse().forEach((fn) => fn());
        releaseLocks();
      },
      release: () => {
        this.released++;
      },
      execute: async (rawSql: string, params: unknown[] = []) => {
        await tick();
        const sql = normalize(rawSql);
        if (this.failOn?.(sql)) throw new Error("injected DB failure");

        if (
          /^SELECT id, user_id, title FROM posts WHERE public_id = \? AND deleted_at IS NULL( FOR UPDATE)?$/.test(
            sql,
          )
        ) {
          const post = this.posts.get(params[0] as string);
          if (!post) return [[], undefined];
          if (sql.endsWith("FOR UPDATE")) held.push(await this.acquire(post.id));
          return [[{ id: post.id, user_id: post.user_id, title: post.title }], undefined];
        }

        if (
          sql === "SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?"
        ) {
          const exists = this.likes.has(`${params[0]}:${params[1]}`);
          return [exists ? [{ 1: 1 }] : [], undefined];
        }

        if (
          sql === "INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)"
        ) {
          const key = `${params[0]}:${params[1]}`;
          if (this.likes.has(key)) {
            throw Object.assign(new Error("Duplicate entry"), {
              code: "ER_DUP_ENTRY",
            });
          }
          this.likes.add(key);
          undo.push(() => this.likes.delete(key));
          return [{ affectedRows: 1 }, undefined];
        }

        if (sql === "DELETE FROM post_likes WHERE user_id = ? AND post_id = ?") {
          const key = `${params[0]}:${params[1]}`;
          const existed = this.likes.delete(key);
          if (existed) undo.push(() => this.likes.add(key));
          return [{ affectedRows: existed ? 1 : 0 }, undefined];
        }

        const bump = (postId: number, apply: (n: number) => number) => {
          const post = [...this.posts.values()].find((p) => p.id === postId)!;
          const before = post.likes_count;
          post.likes_count = apply(before);
          undo.push(() => (post.likes_count = before));
          return [{ affectedRows: 1 }, undefined];
        };

        if (
          sql === "UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?"
        ) {
          return bump(params[0] as number, (n) => n + 1);
        }

        if (
          sql ===
          "UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?"
        ) {
          return bump(params[0] as number, (n) => Math.max(n - 1, 0));
        }

        if (sql === "SELECT likes_count FROM posts WHERE id = ?") {
          const post = [...this.posts.values()].find((p) => p.id === params[0])!;
          return [[{ likes_count: post.likes_count }], undefined];
        }

        throw new Error(`FakeDb: unexpected SQL: ${sql}`);
      },
    };
  }

  async poolExecute(rawSql: string, params: unknown[]) {
    const sql = normalize(rawSql);
    if (
      sql ===
      "SELECT 1 FROM post_likes pl JOIN posts p ON pl.post_id = p.id WHERE pl.user_id = ? AND p.public_id = ? AND p.deleted_at IS NULL"
    ) {
      const post = this.posts.get(params[1] as string);
      const liked = !!post && this.likes.has(`${params[0]}:${post.id}`);
      return [liked ? [{ 1: 1 }] : [], undefined];
    }
    throw new Error(`FakeDb: unexpected pool SQL: ${sql}`);
  }
}

let mockDb: FakeDb;

// ---------------------------------------------------------------------------
// Test app & fixtures
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.locals.io = {}; // truthy: createNotification itself is mocked
  next();
});
app.use("/api/posts/:postId/like", likeRouter);

const OWNER = { userId: 10, email: "owner@test.dev", username: "owner" };
const ALICE = { userId: 20, email: "alice@test.dev", username: "alice" };
const POST_ID = 1;
const PUBLIC_ID = "pub-1";

// Post starts with 3 likes: two from other users (30, 31) + optionally alice.
function seed({ aliceLiked }: { aliceLiked: boolean }) {
  mockDb.addPost({
    id: POST_ID,
    user_id: OWNER.userId,
    public_id: PUBLIC_ID,
    title: "Chair",
    likes_count: aliceLiked ? 3 : 2,
  });
  mockDb.likes.add(`30:${POST_ID}`);
  mockDb.likes.add(`31:${POST_ID}`);
  if (aliceLiked) mockDb.likes.add(`${ALICE.userId}:${POST_ID}`);
}

const post = () => mockDb.posts.get(PUBLIC_ID)!;

const send = (
  method: "put" | "post" | "get",
  user: object | null,
  body?: unknown,
  publicId = PUBLIC_ID,
) => {
  let req = request(app)[method](`/api/posts/${publicId}/like`);
  if (user) req = req.set("x-test-user", JSON.stringify(user));
  return body === undefined ? req : req.send(body as object);
};

// Invariant that must hold after any sequence of operations
const expectCountMatchesRows = () =>
  expect(post().likes_count).toBe(mockDb.likeRows(POST_ID));

beforeEach(() => {
  mockDb = new FakeDb();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// PUT — declarative
// ---------------------------------------------------------------------------
describe("PUT /like (declarative)", () => {
  it("likes: inserts the row, +1 count, notifies owner and enqueues vector update", async () => {
    seed({ aliceLiked: false });

    const res = await send("put", ALICE, { liked: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: true, likesCount: 3 });
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(true);
    expectCountMatchesRows();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: OWNER.userId,
        sender_id: ALICE.userId,
        type: "LIKE",
        link: `/item/${PUBLIC_ID}`,
      }),
    );
    expect(enqueueUserVectorUpdate).toHaveBeenCalledTimes(1);
    expect(enqueueUserVectorUpdate).toHaveBeenCalledWith({
      userId: ALICE.userId,
      postId: POST_ID,
      action: "like",
    });
  });

  it("is idempotent: liking an already-liked post changes nothing and re-sends no side effects", async () => {
    seed({ aliceLiked: true });

    const res = await send("put", ALICE, { liked: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: true, likesCount: 3 });
    expect(post().likes_count).toBe(3);
    expectCountMatchesRows();
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueueUserVectorUpdate).not.toHaveBeenCalled();
  });

  it("unlikes: removes the row, -1 count, no notification", async () => {
    seed({ aliceLiked: true });

    const res = await send("put", ALICE, { liked: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: false, likesCount: 2 });
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(false);
    expectCountMatchesRows();
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueueUserVectorUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent: unliking a not-liked post must not decrement other users' likes", async () => {
    seed({ aliceLiked: false });

    const res = await send("put", ALICE, { liked: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ liked: false, likesCount: 2 });
    expect(post().likes_count).toBe(2);
    expectCountMatchesRows();
  });

  it("does not notify when the owner likes their own post", async () => {
    seed({ aliceLiked: false });

    const res = await send("put", OWNER, { liked: true });

    expect(res.status).toBe(200);
    expect(res.body.liked).toBe(true);
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueueUserVectorUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing body", undefined],
    ["empty object", {}],
    ["string instead of boolean", { liked: "true" }],
    ["number instead of boolean", { liked: 1 }],
    ["null", { liked: null }],
  ])("rejects invalid payload (%s) with 400 and no writes", async (_name, body) => {
    seed({ aliceLiked: false });

    const res = await send("put", ALICE, body);

    expect(res.status).toBe(400);
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(false);
    expect(post().likes_count).toBe(2);
    expect(mockDb.released).toBe(0); // rejected before taking a connection
  });

  it("returns 404 for an unknown post and releases the connection", async () => {
    seed({ aliceLiked: false });

    const res = await send("put", ALICE, { liked: true }, "does-not-exist");

    expect(res.status).toBe(404);
    expect(mockDb.released).toBe(1);
  });

  it("returns 401 when unauthenticated", async () => {
    seed({ aliceLiked: false });

    const res = await send("put", null, { liked: true });

    expect(res.status).toBe(401);
    expect(post().likes_count).toBe(2);
  });

  it("rolls back and returns 500 when a statement fails mid-transaction", async () => {
    seed({ aliceLiked: false });
    mockDb.failOn = (sql) => sql.startsWith("UPDATE posts SET likes_count");

    const res = await send("put", ALICE, { liked: true });

    expect(res.status).toBe(500);
    // INSERT happened before the failing UPDATE; rollback must have undone it
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(false);
    expect(post().likes_count).toBe(2);
    expect(mockDb.released).toBe(1);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Concurrency — the actual bug being guarded against
// ---------------------------------------------------------------------------
describe("concurrent requests from the same user", () => {
  it("5 parallel PUT liked=false decrement exactly once", async () => {
    seed({ aliceLiked: true });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => send("put", ALICE, { liked: false })),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(false);
    expect(post().likes_count).toBe(2); // not 0 (over-decrement)
    expectCountMatchesRows();
  });

  it("5 parallel PUT liked=true insert once, never 500, notify once", async () => {
    seed({ aliceLiked: false });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => send("put", ALICE, { liked: true })),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(post().likes_count).toBe(3);
    expectCountMatchesRows();
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(enqueueUserVectorUpdate).toHaveBeenCalledTimes(1);
  });

  it("parallel legacy POST toggles are serialized: even count returns to start, no 500", async () => {
    seed({ aliceLiked: false });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => send("post", ALICE)),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    // 4 toggles from "not liked" -> back to "not liked"
    expect(mockDb.likes.has(`${ALICE.userId}:${POST_ID}`)).toBe(false);
    expect(post().likes_count).toBe(2);
    expectCountMatchesRows();
  });

  it("mixed parallel PUT liked=true/false always ends consistent (row count == likes_count)", async () => {
    seed({ aliceLiked: false });

    const results = await Promise.all(
      [true, false, true, false, true, false, true].map((liked) =>
        send("put", ALICE, { liked }),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    expectCountMatchesRows();
    expect(post().likes_count).toBeGreaterThanOrEqual(2);
    expect(post().likes_count).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Legacy POST toggle & GET status
// ---------------------------------------------------------------------------
describe("POST /like (legacy toggle)", () => {
  it("toggles on then off", async () => {
    seed({ aliceLiked: false });

    const on = await send("post", ALICE);
    expect(on.body).toEqual({ liked: true });
    expect(post().likes_count).toBe(3);

    const off = await send("post", ALICE);
    expect(off.body).toEqual({ liked: false });
    expect(post().likes_count).toBe(2);
    expectCountMatchesRows();
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});

describe("GET /like", () => {
  it("reflects current like state", async () => {
    seed({ aliceLiked: false });
    expect((await send("get", ALICE)).body).toEqual({ liked: false });

    await send("put", ALICE, { liked: true });
    expect((await send("get", ALICE)).body).toEqual({ liked: true });
  });
});
