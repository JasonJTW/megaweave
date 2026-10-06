import type { Metadata } from "next";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}): Promise<Metadata> {
  const { locale, orderId } = await params;
  return pageMetadata(locale, "deliveryOrder", `/delivery/${orderId}`, {
    noindex: true,
  });
}

export default function DeliveryOrderidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
