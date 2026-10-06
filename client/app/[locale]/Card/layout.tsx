import type { Metadata } from "next";
import { toLocale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";

// Internal page: left untranslated on purpose, so it stays out of the index
// and out of the sitemap (see UNTRANSLATED_PATHS).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata({
    locale: toLocale(locale),
    path: "/Card",
    title: "Card sandbox",
    description: "Internal sandbox for post card effects.",
    noindex: true,
  });
}

export default function CardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
