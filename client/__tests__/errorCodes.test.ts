import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";

const catalogs = { "zh-TW": zhTW, en };

// The server owns the code list. Import it at runtime (not as a typed import) so
// `next build` inside the client-only Docker context doesn't try to resolve it.
const serverErrorCodes = new URL(
  "../../server/src/utils/errorCodes.ts",
  import.meta.url,
).href;

describe("API error code translations", () => {
  it("translates every server error code, plus the generic fallback, in every locale", async () => {
    const { ERROR_CODES } = (await import(serverErrorCodes)) as {
      ERROR_CODES: readonly string[];
    };
    const expected = [...ERROR_CODES, "UNKNOWN"].sort();
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const errors: Record<string, unknown> = catalog.Errors ?? {};
      assert.deepEqual(
        Object.keys(errors).sort(),
        expected,
        `Errors namespace in ${locale} must match server ERROR_CODES`,
      );
    }
  });
});
