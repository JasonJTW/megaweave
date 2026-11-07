import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "orgAdmin", "/org-admin", { noindex: true });
}

export default function OrgAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
