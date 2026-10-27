import { IntlMessageFormat } from "intl-messageformat";
import { catalogs, DEFAULT_LOCALE } from "./i18n";
import { LOCALES } from "../validations";

type MessageTree = { [key: string]: string | MessageTree };

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

describe("server translation catalogs", () => {
  it("has the same keys in every locale", () => {
    const source = [...flatten(catalogs[DEFAULT_LOCALE]).keys()].sort();
    for (const locale of LOCALES) {
      expect([...flatten(catalogs[locale]).keys()].sort()).toEqual(source);
    }
  });

  it("has only non-empty, ICU-parsable messages", () => {
    for (const locale of LOCALES) {
      for (const [key, message] of flatten(catalogs[locale])) {
        expect({ key, empty: !message.trim() }).toEqual({ key, empty: false });
        expect(() => new IntlMessageFormat(message, locale)).not.toThrow();
      }
    }
  });
});
