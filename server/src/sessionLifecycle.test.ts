// Session 生命週期（HTTP seam）：真的 requireAuth / optionalAuth + 真的 session.ts，
// 只把 Redis 換成 in-memory fake，時間用 Date.now spy 控制。
// 瀏覽器用一個會依 Max-Age 過期的 cookie jar 模擬。
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { request } from "./testUtils/testApi";
import type { Response as TestResponse } from "./testUtils/testApi";
import { FakeSessionRedis } from "./testUtils/fakeSessionRedis";
import {
  createUserSession,
  removeUserSession,
  updateSessionsForUser,
  updateUserSession,
} from "./session";
import { optionalAuth, requireAuth } from "./middleware/auth";
import { errorMiddleware } from "./utils/errorHandler";
import currentUserRouter from "./currentUser";
import userprofileRouter from "./userprofile";
import dbPool from "./utils/db";
import type { UserSession } from "./schema";

jest.mock("./utils/redis", () => {
  const { FakeSessionRedis: Fake } = jest.requireActual("./testUtils/fakeSessionRedis");
  const fake = new Fake();
  return {
    __fake: fake,
    getCacheRedisClient: () => fake,
    connectRedis: async () => {
      if (fake.down) throw new Error("Redis connection lost");
    },
    isRedisConnected: () => !fake.down,
  };
});

jest.mock("./utils/db", () => ({
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const redis: FakeSessionRedis = require("./utils/redis").__fake;

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);
let now = START;
jest.spyOn(Date, "now").mockImplementation(() => now);
const advanceDays = (days: number) => {
  now += days * DAY;
};

const alice: UserSession = {
  userId: 7,
  role: "user",
  username: "alice",
  email: "alice@example.com",
  public_id: "pub-alice",
  joined_at: new Date("2025-01-01T00:00:00Z"),
};

//* 依 Set-Cookie 更新、並依 Max-Age 自動過期的瀏覽器 cookie jar
class CookieJar {
  private cookies = new Map<string, { value: string; expiresAt: number }>();

  absorb(res: TestResponse) {
    const header = res.headers["set-cookie"] as unknown as string[] | undefined;
    for (const line of header ?? []) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = decodeURIComponent(pair.slice(eq + 1));
      let expiresAt = Infinity;
      for (const attr of attrs) {
        const [k, v] = attr.split("=");
        if (k.toLowerCase() === "max-age") expiresAt = now + Number(v) * 1000;
        else if (k.toLowerCase() === "expires" && expiresAt === Infinity)
          expiresAt = new Date(v).getTime();
      }
      if (expiresAt <= now) this.cookies.delete(name);
      else this.cookies.set(name, { value, expiresAt });
    }
  }

  get(name: string) {
    const c = this.cookies.get(name);
    if (!c || c.expiresAt <= now) return undefined;
    return c.value;
  }

  /** 剩下幾天過期（給斷言用） */
  daysLeft(name: string) {
    const c = this.cookies.get(name);
    return c ? (c.expiresAt - now) / DAY : undefined;
  }

  set(name: string, value: string) {
    this.cookies.set(name, { value, expiresAt: Infinity });
  }

  header() {
    return [...this.cookies.entries()]
      .filter(([, c]) => c.expiresAt > now)
      .map(([k, c]) => `${k}=${encodeURIComponent(c.value)}`)
      .join("; ");
  }
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/currentUser", currentUserRouter);
  app.use("/api/userprofile", userprofileRouter);
  app.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await createUserSession(alice, req, res);
      return res.sendStatus(204);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/logout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await removeUserSession(req, res);
      return res.sendStatus(204);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/rename", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await updateUserSession(req, { username: "alice-renamed" });
      return res.sendStatus(204);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/me", requireAuth, (req: Request, res: Response) => {
    res.json({ user: req.user });
  });
  app.get("/maybe", optionalAuth, (req: Request, res: Response) => {
    res.json({ user: req.user ?? null });
  });
  app.use(errorMiddleware);
  return app;
}

async function send(
  jar: CookieJar,
  method: "get" | "post",
  path: string,
  body?: object,
) {
  const req = request(makeApp())[method](path).set("Cookie", jar.header());
  const res = await (body ? req.send(body) : req);
  jar.absorb(res);
  return res;
}

async function signedInBrowser() {
  const jar = new CookieJar();
  await send(jar, "post", "/login");
  return jar;
}

beforeEach(() => {
  jest.clearAllMocks();
  now = START;
  redis.down = false;
  for (const key of redis.keys("")) void redis.del(key);
});

describe("session 在 Redis 消失時", () => {
  it("瀏覽器帶著 cookie 但 Redis 沒有這個 session：回 401 並清掉 session-id 和 user-role", async () => {
    const jar = await signedInBrowser();
    for (const key of redis.keys("session:")) await redis.del(key);

    const res = await send(jar, "get", "/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
    expect(jar.get("session-id")).toBeUndefined();
    expect(jar.get("user-role")).toBeUndefined();
  });

  it("Redis 連線失敗：回 503，cookie 保留，Redis 恢復後原本的 session 還能用", async () => {
    const jar = await signedInBrowser();
    redis.down = true;

    const outage = await send(jar, "get", "/me");

    expect(outage.status).toBe(503);
    expect(outage.body.code).toBe("SERVICE_UNAVAILABLE");
    expect(jar.get("session-id")).toBeDefined();
    expect(jar.get("user-role")).toBe("user");

    redis.down = false;
    const recovered = await send(jar, "get", "/me");
    expect(recovered.status).toBe(200);
    expect(recovered.body.user.userId).toBe(alice.userId);
  });
});

describe("滑動續期：閒置 14 天", () => {
  it("過了一半（7 天）之後再使用，會續成從現在起 14 天", async () => {
    const jar = await signedInBrowser();

    advanceDays(8);
    expect((await send(jar, "get", "/me")).status).toBe(200);
    expect(jar.daysLeft("session-id")).toBe(14);
    expect(jar.daysLeft("user-role")).toBe(14);

    advanceDays(13); // 距離登入 21 天，距離上次使用 13 天
    const res = await send(jar, "get", "/me");
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(alice.userId);
  });

  it("還沒過一半就使用，不重寫 Redis 也不重送 cookie", async () => {
    const jar = await signedInBrowser();

    advanceDays(6);
    const res = await send(jar, "get", "/me");

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(jar.daysLeft("session-id")).toBe(8);
  });

  it("14 天都沒使用：瀏覽器 cookie 和 Redis session 都過期，回 401", async () => {
    const jar = await signedInBrowser();

    advanceDays(14);
    const res = await send(jar, "get", "/me");

    expect(res.status).toBe(401);
    expect(redis.keys("session:")).toHaveLength(0);
  });
});

describe("絕對逾時：登入滿 30 天", () => {
  it("一直有在用也只能撐到登入後 30 天，最後一次續期不會超過這個上限", async () => {
    const jar = await signedInBrowser();

    for (const day of [7, 14, 21, 28]) {
      advanceDays(7);
      expect({ day, status: (await send(jar, "get", "/me")).status }).toEqual({
        day,
        status: 200,
      });
    }
    expect(jar.daysLeft("session-id")).toBe(2);
    expect(jar.daysLeft("user-role")).toBe(2);

    advanceDays(2);
    expect((await send(jar, "get", "/me")).status).toBe(401);
    expect(redis.keys("session:")).toHaveLength(0);
  });
});

describe("更新 session 內容（例如改暱稱）", () => {
  it("改完之後 session 照常可用，而且不會重設登入 30 天的期限", async () => {
    const jar = await signedInBrowser();

    advanceDays(10);
    expect((await send(jar, "post", "/rename")).status).toBe(204);
    const me = await send(jar, "get", "/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("alice-renamed");

    advanceDays(7); // 第 17 天
    expect((await send(jar, "get", "/me")).status).toBe(200);
    advanceDays(13); // 第 30 天
    expect((await send(jar, "get", "/me")).status).toBe(401);
  });
});

describe("部署前就存在的舊 session（沒有續期時間戳）", () => {
  async function legacyBrowser() {
    //* 舊版 createUserSession 寫進 Redis 的格式：只有 user 欄位，TTL 7 天
    await redis.setEx("session:legacy-sid", 7 * 24 * 60 * 60, JSON.stringify(alice));
    const jar = new CookieJar();
    jar.set("session-id", "legacy-sid");
    jar.set("user-role", "user");
    return jar;
  }

  it("第一次使用時補上時間戳：不會被登出，並改用 14 天閒置規則", async () => {
    const jar = await legacyBrowser();

    const first = await send(jar, "get", "/me");
    expect(first.status).toBe(200);
    expect(jar.daysLeft("session-id")).toBe(14);

    advanceDays(10); // 超過舊版的 7 天
    expect((await send(jar, "get", "/me")).status).toBe(200);
  });

  it("第一次使用後加進 userId 索引，之後 updateSessionsForUser 找得到它", async () => {
    const jar = await legacyBrowser();
    await send(jar, "get", "/me");

    expect(await updateSessionsForUser(alice.userId, { role: "admin" })).toBe(1);
    expect((await send(jar, "get", "/me")).body.user.role).toBe("admin");
  });
});

describe("user-role cookie 跟著 session 走", () => {
  it("cookie 的 role 跟 session 不一致時（過時或被改過），改回 session 的 role，到期日不變", async () => {
    const jar = await signedInBrowser();
    advanceDays(2);
    jar.set("user-role", "admin");

    const res = await send(jar, "get", "/me");

    expect(res.status).toBe(200);
    expect(jar.get("user-role")).toBe("user");
    expect(jar.daysLeft("user-role")).toBe(12);
  });
});

describe("updateSessionsForUser：更新某個 user 在所有裝置上的 session", () => {
  it("兩台裝置都登入時，兩個 session 都換成新 role，下一個請求 user-role cookie 也跟著更新", async () => {
    const laptop = await signedInBrowser();
    const phone = await signedInBrowser();

    const updated = await updateSessionsForUser(alice.userId, { role: "admin" });

    expect(updated).toBe(2);
    for (const jar of [laptop, phone]) {
      const me = await send(jar, "get", "/me");
      expect(me.body.user.role).toBe("admin");
      expect(jar.get("user-role")).toBe("admin");
    }
  });

  it("已登出或已過期的 session 不會被更新，也不會被計數", async () => {
    const loggedOut = await signedInBrowser();
    await send(loggedOut, "post", "/logout");
    await signedInBrowser(); // 這台之後閒置到過期
    advanceDays(10);
    const active = await signedInBrowser();
    advanceDays(5); // 第 15 天：第二台已閒置 15 天

    expect(await updateSessionsForUser(alice.userId, { role: "admin" })).toBe(1);
    expect((await send(active, "get", "/me")).body.user.role).toBe("admin");
  });

  it("其中一筆 session 資料壞掉時跳過它，其他 session 照樣更新", async () => {
    await signedInBrowser();
    const phone = await signedInBrowser();
    const [firstKey] = redis.keys("session:");
    await redis.setEx(firstKey, 60, "not json");

    expect(await updateSessionsForUser(alice.userId, { role: "admin" })).toBe(1);
    expect((await send(phone, "get", "/me")).body.user.role).toBe("admin");
  });

  it("寫回之前同一筆 session 被別的更新改過：重讀後再寫，兩邊的修改都保留", async () => {
    const jar = await signedInBrowser();
    redis.beforeNextWrite(async () => {
      await updateSessionsForUser(alice.userId, { username: "alice-renamed" });
    });

    expect(await updateSessionsForUser(alice.userId, { role: "admin" })).toBe(1);

    const me = await send(jar, "get", "/me");
    expect(me.body.user).toMatchObject({ role: "admin", username: "alice-renamed" });
  });
});

describe("同時寫入同一筆 session", () => {
  it("續期讀完之後、寫回之前有人改了 role：續期不會把新 role 蓋回舊值", async () => {
    const jar = await signedInBrowser();
    advanceDays(8); // 這次請求會續期
    redis.beforeNextWrite(async () => {
      await updateSessionsForUser(alice.userId, { role: "admin" });
    });

    expect((await send(jar, "get", "/me")).status).toBe(200);

    const next = await send(jar, "get", "/me");
    expect(next.body.user.role).toBe("admin");
    expect(jar.get("user-role")).toBe("admin");
  });
});

describe("暱稱：MySQL 是正式來源，session 是快取", () => {
  it("在一台裝置改暱稱，另一台裝置的 /api/currentUser 也拿到新暱稱", async () => {
    (dbPool.query as jest.Mock).mockResolvedValue([{ affectedRows: 1 }]);
    const laptop = await signedInBrowser();
    const phone = await signedInBrowser();

    const rename = await send(laptop, "post", "/api/userprofile/custom_name", {
      custom_name: "Alice Chen ",
    });

    expect(rename.status).toBe(200);
    const me = await send(phone, "get", "/api/currentUser");
    expect(me.body.user.username).toBe("Alice Chen");
  });

  it("/api/currentUser 只讀 session，不查 MySQL", async () => {
    const jar = await signedInBrowser();

    const me = await send(jar, "get", "/api/currentUser");

    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(alice.username);
    expect(dbPool.query).not.toHaveBeenCalled();
    expect(dbPool.execute).not.toHaveBeenCalled();
  });
});
