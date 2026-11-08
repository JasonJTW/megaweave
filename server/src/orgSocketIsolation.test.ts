/**
 * #133 AC：Socket 推播的組織隔離（ADR 0003）。
 *
 * 看不到 Internal／Members 貼文的檢視者對它按讚、留言、發起 Weave 時，
 * 貼文作者不能收到任何 Socket 推播或站內通知——否則推播本身就洩漏了物品存在。
 *
 * 這裡用真的 createNotification 與一個記錄 emit 的 io，只把 MySQL 換成 fake；
 * 正向對照（看得到的檢視者會觸發推播）證明 io 確實接上了。
 */

import express from "express";
import request from "supertest";
import likeRouter from "./like";
import commentsRouter from "./comments";
import weavesRouter from "./weaves";
import { errorMiddleware } from "./utils/errorHandler";
import {
  FAKE_ORG_ID,
  fakeVisibleToViewer,
  MEMBERSHIP_SQL,
  type FakeMembership,
} from "./testUtils/fakePostVisibility";

const OWNER_ID = 10;
const VIEWER = { userId: 20, username: "viewer", public_id: "viewer-pub" };

interface FakePost {
  id: number;
  public_id: string;
  user_id: number;
  title: string;
  status: string;
  type: string;
  org_id: number;
  audience_tier: "internal" | "members";
}

const fake = {
  post: null as FakePost | null,
  memberships: [] as FakeMembership[],
  notificationInserts: 0,
};

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

function visiblePost(sql: string, params: unknown[]): FakePost | null {
  const post = fake.post;
  if (!post) return null;
  return fakeVisibleToViewer(sql, post, params.slice(1)) ? post : null;
}

// 只認得被測路徑會送出的語句；其他語句直接丟錯（漏掉可見性檢查的路徑因此不會回 404）
function execute(rawSql: string, params: unknown[] = []): [unknown, unknown] {
  const sql = normalize(rawSql);
  const post = fake.post!;
  if (sql === MEMBERSHIP_SQL) return [fake.memberships, undefined];

  // like.ts applyLike
  if (sql.startsWith("SELECT p.id, p.user_id, p.title FROM posts p WHERE p.public_id = ?")) {
    const row = params[0] === post.public_id ? visiblePost(sql, params) : null;
    return [row ? [{ id: row.id, user_id: row.user_id, title: row.title }] : [], undefined];
  }
  // postVisibility.isPostVisibleTo（留言）與 weaveService.validatePost
  if (/^SELECT (1|p\.user_id, p\.status, p\.type, p\.org_id, p\.org_unit_id) FROM posts p WHERE p\.id = \?/.test(sql)) {
    const row = params[0] === post.id ? visiblePost(sql, params) : null;
    return [row ? [{ 1: 1, user_id: row.user_id, status: row.status, type: row.type }] : [], undefined];
  }

  // 正向對照用：按讚與留言成功寫入
  if (sql === "SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?") return [[], undefined];
  if (/^(INSERT INTO post_likes|UPDATE posts SET likes_count|UPDATE comments SET root_id)/.test(sql)) {
    return [{ affectedRows: 1 }, undefined];
  }
  if (sql === "SELECT likes_count FROM posts WHERE id = ?") return [[{ likes_count: 1 }], undefined];
  if (sql.startsWith("INSERT INTO comments")) return [{ insertId: 7 }, undefined];
  if (/FROM comments c LEFT JOIN users u/.test(sql)) return [[{ id: 7, username: "viewer" }], undefined];
  if (sql === "SELECT user_id, title, public_id FROM posts WHERE id = ?") {
    return [[{ user_id: post.user_id, title: post.title, public_id: post.public_id }], undefined];
  }

  throw new Error(`fake DB: unexpected SQL: ${sql}`);
}

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: async (sql: string, params: unknown[]) => execute(sql, params),
    // notificationService 用 query 寫入 notifications
    query: async (sql: string) => {
      if (!normalize(sql).startsWith("INSERT INTO notifications")) {
        throw new Error(`fake DB: unexpected query: ${sql}`);
      }
      fake.notificationInserts++;
      return [{ insertId: 1 }, undefined];
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute: async (sql: string, params: unknown[]) => execute(sql, params),
    }),
  },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { ...VIEWER, role: "user" };
    next();
  },
}));
jest.mock("./session", () => ({ getUserFromCookie: jest.fn() }));
jest.mock("./queue/queues", () => ({
  enqueueUserVectorUpdate: jest.fn().mockResolvedValue(null),
  enqueueSendEmail: jest.fn().mockResolvedValue(null),
}));
jest.mock("./utils/messageService", () => ({ messageService: {} }));
jest.mock("./utils/updateUserStats", () => ({ updateUserStats: jest.fn() }));

const emit = jest.fn();
const io = { to: jest.fn(() => ({ emit })) };

const app = express();
app.use(express.json());
app.set("io", io); // comments.ts
app.use((_req, res, next) => {
  res.locals.io = io; // like.ts, weaves.ts
  next();
});
app.use("/api/posts/:postId/like", likeRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/weaves", weavesRouter);
app.use(errorMiddleware);

function seedPost(audience_tier: FakePost["audience_tier"]) {
  fake.post = {
    id: 1,
    public_id: "pub-1",
    user_id: OWNER_ID,
    title: "Projector",
    status: "active",
    type: "share",
    org_id: FAKE_ORG_ID,
    audience_tier,
  };
}

const actions = {
  like: () => request(app).put("/api/posts/pub-1/like").send({ liked: true }),
  comment: () => request(app).post("/api/comments").send({ post_id: 1, content: "mine?" }),
  weave: () => request(app).post("/api/weaves").send({ postId: 1 }),
};

// fire-and-forget 的通知（like、weave）在回應送出後才執行，給它一輪事件迴圈
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  fake.memberships = [];
  fake.notificationInserts = 0;
  jest.clearAllMocks();
});

describe.each([
  ["an outsider", "internal", []],
  ["an outsider", "members", []],
  ["an Org Member (members access)", "internal", [{ org_id: FAKE_ORG_ID, access_level: "member" }]],
  ["Internal access to another org", "members", [{ org_id: FAKE_ORG_ID + 1, access_level: "internal" }]],
] as const)("%s acting on a post of tier %s", (_viewer, tier, memberships) => {
  it.each(Object.keys(actions) as Array<keyof typeof actions>)(
    "%s gets 404 and pushes no socket event or notification",
    async (action) => {
      seedPost(tier);
      fake.memberships = [...memberships];

      const res = await actions[action]();
      await settle();

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("POST_NOT_FOUND");
      expect(io.to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(fake.notificationInserts).toBe(0);
    },
  );
});

describe("control: a viewer who can see the post", () => {
  it.each(["like", "comment"] as const)(
    "%s notifies the post owner over the socket",
    async (action) => {
      seedPost("internal");
      fake.memberships = [{ org_id: FAKE_ORG_ID, access_level: "internal" }];

      const res = await actions[action]();
      await settle();

      expect(res.status).toBeLessThan(300);
      expect(io.to).toHaveBeenCalledWith(`user_${OWNER_ID}`);
      expect(emit).toHaveBeenCalledWith("new_notification", expect.anything());
      expect(fake.notificationInserts).toBe(1);
    },
  );
});
