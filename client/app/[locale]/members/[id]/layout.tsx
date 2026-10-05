import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return pageMetadata(locale, "member", `/members/${id}`);
}

export default function MembersIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
