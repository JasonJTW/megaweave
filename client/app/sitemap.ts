import { MetadataRoute } from "next";
import { routing, localizePath } from "@/i18n/routing";
import { INDEXABLE_PATHS, absoluteUrl, localeAlternates } from "@/lib/seo";

/**
 * Every public page in both languages, each entry carrying the full set of
 * hreflang alternates so search engines can pair the language versions up.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return INDEXABLE_PATHS.flatMap((path) => {
    const isHome = path === "/";

    return routing.locales.map((locale) => ({
      url: absoluteUrl(localizePath(locale, path)),
      lastModified,
      changeFrequency: isHome ? ("daily" as const) : ("weekly" as const),
      priority: isHome ? 1 : 0.7,
      alternates: { languages: localeAlternates(locale, path).languages },
    }));
  });
}
