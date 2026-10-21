// passwordHasher.test.ts
import crypto from "crypto";
import { generateSalt, hashPassword, verifyPassword } from "./passwordHasher";

describe("hashPassword", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects instead of throwing inside the callback when scrypt fails asynchronously", async () => {
    const scryptError = new Error("scrypt failed");
    // scrypt reports runtime failures via the callback on a later tick, with hash undefined
    jest.spyOn(crypto, "scrypt").mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1] as (
        err: Error | null,
        key?: Buffer,
      ) => void;
      setImmediate(() => callback(scryptError, undefined));
    }) as unknown as typeof crypto.scrypt);

    await expect(hashPassword("password-123", generateSalt())).rejects.toBe(
      scryptError,
    );
  });
});

describe("verifyPassword", () => {
  const password = "password-123";
  let salt: string;
  let hashed: string;

  beforeAll(async () => {
    salt = generateSalt();
    hashed = await hashPassword(password, salt);
  });

  it("returns true for the correct password", async () => {
    await expect(verifyPassword(password, salt, hashed)).resolves.toBe(true);
  });

  it("returns false for a wrong password", async () => {
    await expect(verifyPassword("wrong-password", salt, hashed)).resolves.toBe(
      false,
    );
  });

  it.each([
    ["non-hex", "not-a-hex-hash"],
    ["empty", ""],
    ["truncated", "ab".repeat(10)],
    ["too long", "ab".repeat(100)],
  ])(
    "returns false instead of throwing when the stored hash is %s",
    async (_label, storedHash) => {
      await expect(verifyPassword(password, salt, storedHash)).resolves.toBe(
        false,
      );
    },
  );
});
