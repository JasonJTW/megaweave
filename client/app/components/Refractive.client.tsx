"use client";
import dynamic from "next/dynamic";

/**
 * Safe-to-import refractive components.
 * These are wrapped with next/dynamic + ssr:false, so they can be
 * statically imported from any client component without triggering
 * the "ImageData is not defined" SSR error.
 *
 * Each component automatically checks for Chromium support via UA-CH / feature detection.
 * On unsupported browsers (iOS Safari, macOS Safari, Firefox), an outer fallback blur
 * layer is applied cleanly without breaking layout or events.
 *
 * Usage:
 *   import { RefractiveDiv, RefractiveButton } from "@/app/components/Refractive.client";
 *
 * Need a new element? Add it to Refractive.tsx, then re-export here with dynamic().
 */

export const RefractiveDiv = dynamic(
  () => import("./Refractive").then((mod) => mod.RefractiveDiv),
  { ssr: false, loading: () => <div /> },
);

export const RefractiveSpan = dynamic(
  () => import("./Refractive").then((mod) => mod.RefractiveSpan),
  { ssr: false, loading: () => <span /> },
);

export const RefractiveButton = dynamic(
  () => import("./Refractive").then((mod) => mod.RefractiveButton),
  { ssr: false },
);

export const RefractiveNav = dynamic(
  () => import("./Refractive").then((mod) => mod.RefractiveNav),
  { ssr: false },
);

export { isChromiumSupported } from "@/utils/browserDetection";
export { useIsChromium } from "@/hooks/useIsChromium";
