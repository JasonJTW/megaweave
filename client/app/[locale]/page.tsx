import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";
import HomeFeed from "./HomeFeed";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "home", "/");
}

export default function HomePage() {
  return <HomeFeed />;
}
