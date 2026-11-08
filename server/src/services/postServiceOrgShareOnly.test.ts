/**
 * 組織物品只能是 Share（PRD 0001 §5.1）：一般的編輯貼文 API 不能把組織貼文改成 Wish 或 Commons。
 */

import { postService } from "./postService";

const ORG_POST = {
  id: 1000,
  public_id: "33333333-3333-4333-8333-333333333333",
  user_id: 2,
  org_id: 10,
  org_unit_id: 201,
  audience_tier: "internal",
  type: "share",
};

jest.mock("../utils/db", () => ({
  __esModule: true,
  default: {
    execute: jest.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM posts WHERE public_id = ?")) return [[ORG_POST]];
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    getConnection: jest.fn(async () => {
      throw new Error("must reject before opening a transaction");
    }),
  },
}));
jest.mock("../utils/redis");
jest.mock("./embeddingService");
jest.mock("../queue/queues", () => ({}));

describe("postService.updatePost on an org item", () => {
  it.each(["wish", "commons"] as const)("refuses to turn it into a %s", async (type) => {
    await expect(
      postService.updatePost(ORG_POST.public_id, ORG_POST.user_id, { type }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_REQUEST" });
  });
});
