/**
 * POST /api/messages 附帶的貼文資訊（ADR 0003）：
 * - post_id 是 client 帶入的 id，格式錯是 client bug → 400 INVALID_REQUEST。
 * - 只要帶了 post_id 就檢查可見性，看不到 → 404，不建立任何訊息，
 *   不論 item_id／item_title 有沒有一起帶（檢查與寫入路徑不能各走各的）。
 */

import express from "express";
import request from "supertest";
import messagesRouter from "./messages";
import { messageService } from "./utils/messageService";
import { errorMiddleware } from "./utils/errorHandler";
import {
  fakeVisibleToViewer,
  MEMBERSHIP_SQL,
} from "./testUtils/fakePostVisibility";

const SENDER = { userId: 20, public_id: "sender-pub", role: "user" };
const INTERNAL_POST = { id: 5, org_id: 7, audience_tier: "internal" };

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (rawSql: string, params: unknown[]) => {
      const sql = normalize(rawSql);
      if (sql === MEMBERSHIP_SQL) return [[]];
      if (sql.startsWith("SELECT 1 FROM posts p WHERE p.id = ?")) {
        const visible =
          params[0] === INTERNAL_POST.id &&
          fakeVisibleToViewer(sql, INTERNAL_POST, params.slice(1));
        return [visible ? [{ 1: 1 }] : []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  },
}));

jest.mock("./middleware/auth", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = SENDER;
    next();
  },
}));

jest.mock("./utils/messageService", () => ({
  messageService: {
    getUserIdByPublicId: jest.fn().mockResolvedValue(30),
    getConversationId: jest.fn().mockResolvedValue(1),
    createMessage: jest.fn().mockResolvedValue({ id: 1 }),
    toMessageDTO: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("./storage/ImageStorage", () => ({
  defaultImageStorage: { upload: jest.fn() },
}));

function makeApp() {
  const app = express();
  app.use("/api/messages", messagesRouter);
  app.use(errorMiddleware);
  return app;
}

const send = (fields: Record<string, string>) => {
  let req = request(makeApp()).post("/api/messages");
  for (const [key, value] of Object.entries({
    recipient_public_id: "recipient-pub",
    content: "hi",
    ...fields,
  })) {
    req = req.field(key, value);
  }
  return req;
};

beforeEach(() => jest.clearAllMocks());

describe("POST /api/messages with post info", () => {
  it.each(["abc", "1.5", "-1", "0", "5abc"])(
    "rejects a malformed post_id (%s) with INVALID_REQUEST and sends nothing",
    async (postId) => {
      const res = await send({ item_id: "9", item_title: "Projector", post_id: postId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
      expect(messageService.createMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["with item info", { item_id: "9", item_title: "Projector" }],
    ["without item info", {}],
  ])("returns 404 for a post the sender cannot see (%s) and sends nothing", async (_name, item) => {
    const res = await send({ ...item, post_id: String(INTERNAL_POST.id) });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });

  it("sends a plain message without post info", async () => {
    const res = await send({});

    expect(res.status).toBeLessThan(300);
    expect(messageService.createMessage).toHaveBeenCalledTimes(1);
  });
});
