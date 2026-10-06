import type { Metadata } from "next";
import { z } from "zod";
import { localizePath, routing, type Locale } from "@/i18n/routing";

/** Canonical origin, used when NEXT_PUBLIC_SITE_URL is unset or malformed. */
const FALLBACK_SITE_URL = "https://megaweaving.net";

const siteUrlSchema = z.url();

export const SITE_NAME = "megaweaving";

/** Open Graph wants an underscored locale ("zh_TW"), not the BCP 47 tag. */
const OG_LOCALES: Record<Locale, string> = {
  "zh-TW": "zh_TW",
  en: "en_US",
};

/**
 * Public routes that need an id in the URL. The sitemap cannot enumerate them;
 * crawlers reach them through links, and each one ships its own metadata.
 */
export const DYNAMIC_PUBLIC_PATHS = ["/item", "/profile", "/members"] as const;

/** Public routes with a fixed URL. Together with the dynamic ones above this
 * must stay in sync with middleware's PUBLIC_ROUTES (asserted in the tests). */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/about",
  "/install",
  "/earthday",
  "/promote",
  "/tinder",
  "/Card",
] as const;

/**
 * Pages left untranslated on purpose (internal sandboxes): kept out of the
 * sitemap and marked noindex.
 */
export const UNTRANSLATED_PATHS = ["/Card", "/sentry-example-page"] as const;

/** Public, translated pages the sitemap lists in both languages. */
export const INDEXABLE_PATHS: readonly string[] = STATIC_PUBLIC_PATHS.filter(
  (path) => !UNTRANSLATED_PATHS.some((untranslated) => path === untranslated),
);

export function siteUrl(): string {
  const parsed = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return (parsed.success ? parsed.data : FALLBACK_SITE_URL).replace(/\/+$/, "");
}

/** Absolute URL for a site-root-relative path ("/" maps to the bare origin). */
export function absoluteUrl(path: string): string {
  return path === "/" ? siteUrl() : `${siteUrl()}${path}`;
}

export type LocaleAlternates = {
  canonical: string;
  /** hreflang → absolute URL, including x-default */
  languages: Record<string, string>;
};

/**
 * Canonical URL plus hreflang alternates for one locale-less path.
 * x-default points at zh-TW, which is the unprefixed default locale (ADR 0002).
 */
export function localeAlternates(
  locale: Locale,
  path: string,
): LocaleAlternates {
  const languages: Record<string, string> = {};
  for (const alternate of routing.locales) {
    languages[alternate] = absoluteUrl(localizePath(alternate, path));
  }
  languages["x-default"] = absoluteUrl(
    localizePath(routing.defaultLocale, path),
  );

  return { canonical: absoluteUrl(localizePath(locale, path)), languages };
}

export type PageMetadataInput = {
  locale: Locale;
  /** Locale-less path of the page, e.g. "/about" or "/item/123" */
  path: string;
  title: string;
  description: string;
  images?: NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;
  /** Pages we do not want indexed (internal sandboxes, signed-in areas) */
  noindex?: boolean;
};

/** Localized title, description, Open Graph and hreflang alternates for a page. */
export function buildMetadata({
  locale,
  path,
  title,
  description,
  images,
  noindex,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: localeAlternates(locale, path),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteUrl(localizePath(locale, path)),
      locale: OG_LOCALES[locale],
      ...(images ? { images } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
