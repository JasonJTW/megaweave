import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import { REQUIRED_PARAMS } from "../utils/notificationText";

const catalogs = { "zh-TW": zhTW, en };

// The server owns the type list. Import it at runtime (not as a typed import) so
// `next build` inside the client-only Docker context doesn't try to resolve it.
const serverNotificationTypes = new URL(
  "../../server/src/utils/notificationTypes.ts",
  import.meta.url,
).href;

describe("notification types", () => {
  it("renders exactly the server types that carry params, in every locale", async () => {
    const { RENDERED_NOTIFICATION_TYPES } = (await import(
      serverNotificationTypes
    )) as { RENDERED_NOTIFICATION_TYPES: readonly string[] };
    const expected = [...RENDERED_NOTIFICATION_TYPES].sort();

    assert.deepEqual(
      Object.keys(REQUIRED_PARAMS).sort(),
      expected,
      "REQUIRED_PARAMS must match server RENDERED_NOTIFICATION_TYPES",
    );
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const events: Record<string, { title?: unknown; content?: unknown }> =
        catalog.Notifications.event;
      assert.deepEqual(
        Object.keys(events).sort(),
        expected,
        `Notifications.event in ${locale} must match server RENDERED_NOTIFICATION_TYPES`,
      );
      for (const type of expected) {
        assert.equal(typeof events[type].title, "string", `${locale} ${type}`);
        assert.equal(
          typeof events[type].content,
          "string",
          `${locale} ${type}`,
        );
      }
    }
  });
});
