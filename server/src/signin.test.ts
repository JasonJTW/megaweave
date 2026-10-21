// signin.test.ts
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import dbPool from "./utils/db";
import { createUserSession } from "./session";
import { generateSalt, hashPassword } from "./passwordHasher";

jest.mock("./utils/db", () => ({
  __esModule: true,
  default: { execute: jest.fn() },
}));

jest.mock("./session", () => ({
  createUserSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./middleware/rateLimiter", () => ({
  authRateLimiter: [
    (_req: Request, _res: Response, next: NextFunction) => next(),
  ],
}));

const EMAIL = "user@example.com";
const PASSWORD = "password-123";

type UserRow = {
  id: number;
  email: string;
  username: string;
  custom_name: string | null;
  role: string;
  providers: string;
  password: string | null;
  salt: string | null;
  avatar_url: string | null;
  avatar_key: string | null;
  public_id: string;
  created_at: Date;
};

function mockUserRow(overrides: Partial<UserRow>) {
  const row: UserRow = {
    id: 1,
    email: EMAIL,
    username: "tester",
    custom_name: null,
    role: "user",
    providers: JSON.stringify(["native"]),
    password: null,
    salt: null,
    avatar_url: null,
    avatar_key: null,
    public_id: "pub-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
  (dbPool.execute as jest.Mock).mockResolvedValueOnce([[row], []]);
}

describe("POST /signin (native)", () => {
  let app: express.Express;
  let salt: string;
  let hashed: string;

  beforeAll(async () => {
    // signin.ts fails fast at import time without this
    process.env.GOOGLE_CLIENT_ID =
      process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    const { default: signinRouter } = await import("./signin");
    app = express();
    app.use(express.json());
    app.use("/signin", signinRouter);

    salt = generateSalt();
    hashed = await hashPassword(PASSWORD, salt);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const signin = () =>
    request(app).post("/signin").send({ email: EMAIL, password: PASSWORD });

  it("signs in with the correct password", async () => {
    mockUserRow({ password: hashed, salt });

    const res = await signin();

    expect(res.status).toBe(200);
    expect(createUserSession).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when the stored hash is corrupted", async () => {
    mockUserRow({ password: "not-a-hex-hash", salt });

    const res = await signin();

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ errorMessage: "Invalid email or password" });
    expect(createUserSession).not.toHaveBeenCalled();
  });

  it.each([
    ["password", { password: null, salt: "0".repeat(32) }],
    ["salt", { password: "ab".repeat(64), salt: null }],
  ])(
    "returns 401 when a native user is missing %s",
    async (_label, credentials) => {
      mockUserRow(credentials);

      const res = await signin();

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ errorMessage: "Invalid email or password" });
      expect(createUserSession).not.toHaveBeenCalled();
    },
  );

  it("points social-only users to their provider", async () => {
    mockUserRow({ providers: JSON.stringify(["google"]) });

    const res = await signin();

    expect(res.status).toBe(400);
    expect(res.body.errorMessage).toContain("google");
    expect(createUserSession).not.toHaveBeenCalled();
  });
});
