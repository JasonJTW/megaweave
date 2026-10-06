import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { buildMetadata } from "./seo";

/** Metadata entries that are just a title and a description for one page. */
export type MetadataPageKey = {
  [K in keyof Messages["Metadata"]]: Messages["Metadata"][K] extends {
    title: string;
    description: string;
  }
    ? K
    : never;
}[keyof Messages["Metadata"]];

/**
 * Localized metadata for a page whose title and description are static text.
 * `path` is the locale-less path, so the hreflang alternates stay in sync with
 * the route the page is mounted at.
 */
export async function pageMetadata(
  localeParam: string,
  key: MetadataPageKey,
  path: string,
  options: { noindex?: boolean } = {},
): Promise<Metadata> {
  const locale = toLocale(localeParam);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return buildMetadata({
    locale,
    path,
    title: t(`${key}.title`),
    description: t(`${key}.description`),
    ...options,
  });
}
