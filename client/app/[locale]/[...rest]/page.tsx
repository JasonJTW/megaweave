import { notFound } from "next/navigation";

// Unknown paths still render inside the localized root layout
export default function CatchAllPage() {
  notFound();
}
