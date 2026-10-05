import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; uuid: string }>;
}): Promise<Metadata> {
  const { locale, uuid } = await params;
  return pageMetadata(locale, "profile", `/profile/${uuid}`);
}

export default function ProfileUuidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
