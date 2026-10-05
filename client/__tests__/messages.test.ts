import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IntlMessageFormat } from "intl-messageformat";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import { routing } from "../i18n/routing";

type MessageTree = { [key: string]: string | MessageTree };

const catalogs: Record<string, MessageTree> = { "zh-TW": zhTW, en };

function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(path, value);
    } else {
      for (const [nested, message] of flatten(value, path)) {
        entries.set(nested, message);
      }
    }
  }
  return entries;
}

describe("Translation catalogs", () => {
  it("has one catalog per configured locale", () => {
    assert.deepEqual(Object.keys(catalogs).sort(), [...routing.locales].sort());
  });

  it("has the same keys in every locale", () => {
    const source = [...flatten(catalogs[routing.defaultLocale]).keys()].sort();
    for (const locale of routing.locales) {
      const keys = [...flatten(catalogs[locale]).keys()].sort();
      assert.deepEqual(keys, source, `Key mismatch in ${locale}`);
    }
  });

  it("has only non-empty, ICU-parsable messages", () => {
    for (const locale of routing.locales) {
      for (const [key, message] of flatten(catalogs[locale])) {
        assert.ok(message.trim(), `Empty message ${locale}:${key}`);
        assert.doesNotThrow(
          () => new IntlMessageFormat(message, locale),
          `Invalid ICU message ${locale}:${key}`,
        );
      }
    }
  });
});
