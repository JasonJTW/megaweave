import type zhTW from "../messages/zh-TW.json";
import type en from "../messages/en.json";
import type { routing } from "./routing";

// zh-TW is the source catalog: t() only accepts its keys, and every other
// catalog must provide all of them, so a missing key fails `tsc --noEmit`.
type AssertComplete<Catalog extends typeof zhTW> = Catalog;
export type CompleteCatalogs = AssertComplete<typeof en>;

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof zhTW;
  }
}
