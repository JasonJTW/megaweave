/**
 * POST /api/messages 附帶的貼文資訊（ADR 0003）：
 * - post_id 是 client 帶入的 id，格式錯是 client bug → 400 INVALID_REQUEST。
 * - 只要帶了 post_id 就檢查可見性：寄件人與收件人都要看得到，任一方看不到 → 404，
 *   不上傳附件、不建立任何訊息，不論 item_id／item_title 有沒有一起帶（檢查與寫入路徑不能各走各的）。
 *   只檢查寄件人的話，Internal 成員就能把 Internal 物品的資訊私訊給組織外的人。
 */

import express from "express";
import { request } from "./testUtils/testApi";
import messagesRouter from "./messages";
import { messageService } from "./utils/messageService";
import { defaultImageStorage } from "./storage/ImageStorage";
import { errorMiddleware } from "./utils/errorHandler";
import {
  FakeMembership,
  fakeVisibleToViewer,
  MEMBERSHIP_SQL,
} from "./testUtils/fakePostVisibility";

const SENDER = { userId: 20, public_id: "sender-pub", role: "user" };
const RECIPIENT_ID = 30;
const INTERNAL_POST = { id: 5, org_id: 7, audience_tier: "internal" };

const INTERNAL_ACCESS: FakeMembership[] = [{ org_id: 7, access_level: "internal" }];

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

//* user id → 組織成員資格；預設兩人都不是組織成員
let mockMemberships: Record<number, FakeMembership[]> = {};

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (rawSql: string, params: unknown[]) => {
      const sql = normalize(rawSql);
      if (sql === MEMBERSHIP_SQL) return [mockMemberships[params[0] as number] ?? []];
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
    getUserIdByPublicId: jest.fn(async () => RECIPIENT_ID),
    getConversationId: jest.fn().mockResolvedValue(1),
    createMessage: jest.fn().mockResolvedValue({ id: 1 }),
    toMessageDTO: jest.fn().mockReturnValue({}),
  },
}));

jest.mock("./storage/ImageStorage", () => ({
  defaultImageStorage: {
    upload: jest.fn().mockResolvedValue({ url: "https://cdn.test/a.png" }),
  },
}));

function makeApp() {
  const app = express();
  app.use("/api/messages", messagesRouter);
  app.use(errorMiddleware);
  return app;
}

const send = (fields: Record<string, string>, withAttachment = false) => {
  let req = request(makeApp()).post("/api/messages");
  if (withAttachment) {
    req = req.attach("images", Buffer.from("png"), {
      filename: "a.png",
      contentType: "image/png",
    });
  }
  for (const [key, value] of Object.entries({
    recipient_public_id: "recipient-pub",
    content: "hi",
    ...fields,
  })) {
    req = req.field(key, value);
  }
  return req;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = {};
});

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

  it("returns 404 when only the sender can see the post, before uploading or sending", async () => {
    mockMemberships = { [SENDER.userId]: INTERNAL_ACCESS };

    const res = await send(
      { item_id: "9", item_title: "Projector", post_id: String(INTERNAL_POST.id) },
      true,
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
    expect(defaultImageStorage.upload).not.toHaveBeenCalled();
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });

  it("returns 404 when only the recipient can see the post", async () => {
    mockMemberships = { [RECIPIENT_ID]: INTERNAL_ACCESS };

    const res = await send({ post_id: String(INTERNAL_POST.id) }, true);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("POST_NOT_FOUND");
    expect(defaultImageStorage.upload).not.toHaveBeenCalled();
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });

  it("sends the message when both sides can see the post", async () => {
    mockMemberships = {
      [SENDER.userId]: INTERNAL_ACCESS,
      [RECIPIENT_ID]: INTERNAL_ACCESS,
    };

    const res = await send({ post_id: String(INTERNAL_POST.id) });

    expect(res.status).toBeLessThan(300);
    expect(messageService.createMessage).toHaveBeenCalled();
  });

  it("sends a plain message without post info", async () => {
    const res = await send({});

    expect(res.status).toBeLessThan(300);
    expect(messageService.createMessage).toHaveBeenCalledTimes(1);
  });
});
