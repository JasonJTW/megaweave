import type Redis from "ioredis";
import type { Pool } from "mysql2/promise";
import { BenchmarkSafetyError } from "../benchmark/errors";
import { verifyPassword } from "../passwordHasher";
import type { FixtureStores } from "../benchmark/fixture/dataStoreGuard";
import { resetAndSeedE2e, resolveE2eUser, seedE2eUser } from "./seed";

function createFakeQueueRedis(marker: string | null | Error) {
  const calls: string[] = [];
  const redis = {
    get: jest.fn(async () => {
      calls.push("get");
      if (marker instanceof Error) throw marker;
      return marker;
    }),
    flushdb: jest.fn(async () => {
      calls.push("flushdb");
    }),
    set: jest.fn(async (...args: string[]) => {
      calls.push(`set:${args.join("=")}`);
    }),
  };
  return { redis: redis as unknown as Redis, calls };
}

describe("resolveE2eUser", () => {
  it("reads the test account from env", () => {
    expect(
      resolveE2eUser({
        E2E_USER_EMAIL: "e2e@megaweave.test",
        E2E_USER_PASSWORD: "password-123",
        E2E_USER_NAME: "E2E",
      }),
    ).toEqual({ email: "e2e@megaweave.test", password: "password-123", username: "E2E" });
  });

  it("rejects missing configuration", () => {
    expect(() => resolveE2eUser({})).toThrow(/server\/e2e\.env/);
  });
});

describe("resetAndSeedE2e", () => {
  const user = { email: "e2e@megaweave.test", password: "password-123", username: "E2E" };

  it.each([null, "production", new Error("ECONNREFUSED")])(
    "touches no data store when the queue marker is %p",
    async (marker) => {
      const { redis, calls } = createFakeQueueRedis(marker);
      const stores = new Proxy(
        {},
        {
          get: () => {
            throw new Error("data store accessed before the queue marker was verified");
          },
        },
      ) as FixtureStores;

      await expect(resetAndSeedE2e(stores, redis, user)).rejects.toBeInstanceOf(
        BenchmarkSafetyError,
      );
      expect(calls).toEqual(["get"]);
    },
  );
});

describe("seedE2eUser", () => {
  it("creates a native user whose password verifies like signin", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const mysql = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return [{ insertId: 42 }, []];
      }),
    } as unknown as Pool;

    const id = await seedE2eUser(mysql, {
      email: "e2e@megaweave.test",
      password: "password-123",
      username: "E2E",
    });

    expect(id).toBe(42);
    const [insertUser, insertProfile] = queries;
    const [username, email, hashed, salt, providers, role] = insertUser.params as string[];
    expect([username, email, providers, role]).toEqual([
      "E2E",
      "e2e@megaweave.test",
      '["native"]',
      "user",
    ]);
    await expect(verifyPassword("password-123", salt, hashed)).resolves.toBe(true);
    expect(insertProfile.params).toEqual([42, "e2e@megaweave.test", "E2E"]);
  });
});
