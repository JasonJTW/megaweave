/**
 * GET /api/me 的 weaves 走 Weave module 的讀取模型：組織 Weave 帶流向單位（ADR 0004）與發文者。
 * 這裡曾有一份手抄的 SELECT，少了 receiver_unit 與 post_author 的 join
 */
import express from "express";
import { request } from "./testUtils/testApi";
import meRouter from "./me";
import dbPool from "./utils/db";
import { errorMiddleware } from "./utils/errorHandler";
import { closeDatabase, resetDb } from "./testUtils/db/reset";
import { addMember, createOrg, createPost, createUnit, createUser, type TestUser } from "./testUtils/db/fixtures";

jest.mock("./queue/queues", () => ({}));

let viewer: TestUser;
jest.mock("./middleware/auth", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: viewer.id, public_id: viewer.publicId, role: "user", username: viewer.name };
    next();
  },
}));

beforeEach(resetDb);
afterAll(closeDatabase);

function makeApp() {
  const app = express();
  app.use("/api/me", meRouter);
  app.use(errorMiddleware);
  return app;
}

describe("GET /api/me weaves", () => {
  it("returns the receiver unit, the post author and the viewer of an org weave", async () => {
    const org = await createOrg("Acme");
    const giving = await createUnit(org, "IT");
    const receiving = await createUnit(org, "Finance");
    const lister = await createUser("lister");
    viewer = await createUser("contact");
    await addMember(org, lister, { contactOf: [giving] });
    await addMember(org, viewer, { contactOf: [receiving] });
    const post = await createPost(lister, { org: { orgId: org.id, unitId: giving }, audienceTier: "internal" });
    await dbPool.execute(
      "INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, status) VALUES (?, ?, ?, ?, 'requested')",
      [post.id, lister.id, viewer.id, receiving],
    );

    const res = await request(makeApp()).get("/api/me");

    expect(res.status).toBe(200);
    expect(res.body.weaves).toHaveLength(1);
    const [weave] = res.body.weaves;
    expect(weave.receiver_org_unit).toEqual({ id: receiving, name: "Finance" });
    expect(weave.post.username).toBe(lister.name);
    expect(weave.viewer).toMatchObject({ role: "receiver", isInitiator: true, commands: ["withdraw"] });
  });
});
