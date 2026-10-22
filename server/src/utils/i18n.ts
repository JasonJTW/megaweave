// server/src/utils/i18n.ts
// Server-generated text (emails) in the recipient's language. Same format as the client's
// catalogs (ICU MessageFormat, one JSON file per locale); zh-TW is the source catalog.

import { IntlMessageFormat } from "intl-messageformat";
import zhTW from "../messages/zh-TW.json";
import enJson from "../messages/en.json";
import { LOCALES, type Locale } from "../validations";

export type Messages = typeof zhTW;

// Typed against the source catalog so a key missing from en fails the typecheck
const en: Messages = enJson;

export const catalogs: Record<Locale, Messages> = { "zh-TW": zhTW, en };

export const DEFAULT_LOCALE: Locale = "zh-TW";

/** users.locale → supported locale; empty or unknown values fall back to zh-TW */
export function resolveLocale(value: unknown): Locale {
  return LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

export type Namespace = keyof Messages;

type Values = Record<string, string | number>;

export type Translator<N extends Namespace> = (
  key: Leaves<Messages[N]>,
  values?: Values,
) => string;

function lookup(tree: unknown, path: string): string {
  const message = path
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      tree,
    );
  if (typeof message !== "string") {
    throw new Error(`Missing translation: ${path}`);
  }
  return message;
}

/** Like next-intl's useTranslations: keys are relative to the namespace */
export function getTranslator<N extends Namespace>(
  locale: Locale,
  namespace: N,
): Translator<N> {
  return (key, values) =>
    String(
      new IntlMessageFormat(
        lookup(catalogs[locale], `${namespace}.${key}`),
        locale,
      ).format(values),
    );
}
