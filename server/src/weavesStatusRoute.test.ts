/**
 * PATCH /api/weaves/:id/status：id 由 client 產生，格式錯是 client bug → 400 INVALID_REQUEST，
 * 不進 Weave module；目標狀態交給 commandForTargetStatus 對成命令
 */
import express from "express";
import { request } from "./testUtils/testApi";
import weavesRouter from "./weaves";
import { errorMiddleware } from "./utils/errorHandler";
import { actOnWeave } from "./services/weave";

jest.mock("./queue/queues", () => ({}));
jest.mock("./services/weave", () => ({
  ...jest.requireActual("./services/weave"),
  actOnWeave: jest.fn().mockResolvedValue({ newStatus: "approved", fullyCompleted: false }),
}));
jest.mock("./middleware/auth", () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 20, public_id: "u-20", role: "user", username: "Mei" };
    next();
  },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/weaves", weavesRouter);
  app.use(errorMiddleware);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("PATCH /api/weaves/:id/status", () => {
  it.each(["abc", "0", "-3", "1.5"])("rejects the id %p with 400 INVALID_REQUEST", async (id) => {
    const res = await request(makeApp()).patch(`/api/weaves/${id}/status`).send({ status: "approved" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(actOnWeave).not.toHaveBeenCalled();
  });

  it("maps the target status to a command for the actor", async () => {
    const res = await request(makeApp()).patch("/api/weaves/7/status").send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ newStatus: "approved", fullyCompleted: false });
    expect(actOnWeave).toHaveBeenCalledWith(
      { weaveId: 7, command: "confirm", actor: { id: 20, name: "Mei" } },
      null,
    );
  });
});
