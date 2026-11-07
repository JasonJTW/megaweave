import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale, "adminOrgs", "/admin/orgs", { noindex: true });
}

export default function AdminOrgsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
