import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { absoluteUrl, buildMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam, id } = await params;
  const locale = toLocale(localeParam);
  const t = await getTranslations({ locale, namespace: "Metadata.item" });
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let post: any = null;
  try {
    const res = await fetch(`${hostName}/api/posts/${id}`);
    if (res.ok) {
      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        post = data.post ?? null;
      }
    }
  } catch {
    // API unreachable or returned non-JSON — fall back to generic metadata
  }

  // The post itself is user content and stays in its original language; only
  // the wrapper around it (post type, fallbacks) follows the page language.
  const title = post?.title
    ? t("title", {
        title: post.title,
        type: t("type", { type: post.type ?? "other" }),
        username: post.username,
      })
    : t("fallbackTitle");
  const description =
    post?.content?.slice(0, 100)?.replace(/\n/g, " ") ||
    t("fallbackDescription");

  return buildMetadata({
    locale,
    path: `/item/${id}`,
    title,
    description,
    images: [
      {
        url: absoluteUrl(`/api/og?id=${id}`),
        width: 900,
        height: 1200,
        alt: title,
      },
    ],
  });
}
