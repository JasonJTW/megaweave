import { defineRouting } from "next-intl/routing";

// ADR 0002: zh-TW is the default and unprefixed, English lives under /en,
// and the locale comes from the URL only (no Accept-Language / cookie redirects).
export const routing = defineRouting({
  locales: ["zh-TW", "en"],
  defaultLocale: "zh-TW",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/**
 * Splits an optional locale prefix (/en, /zh-TW) off a pathname so routes can be
 * classified regardless of language. Unprefixed paths belong to the default locale.
 */
export function splitLocalePrefix(pathname: string): {
  locale: Locale;
  pathname: string;
} {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return { locale, pathname: pathname.slice(prefix.length) || "/" };
    }
  }
  return { locale: routing.defaultLocale, pathname };
}

/**
 * Prefixes a locale-less path for the given locale (as-needed: default locale stays unprefixed)
 */
export function localizePath(locale: Locale, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
