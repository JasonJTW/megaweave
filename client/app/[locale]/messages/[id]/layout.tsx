import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return pageMetadata(locale, "chat", `/messages/${id}`, { noindex: true });
}

export default function MessagesIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
