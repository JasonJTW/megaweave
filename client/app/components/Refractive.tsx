"use client";

/**
 * Refractive exports with fallback blur for non-Chromium browsers.
 * For safe usage across client components without SSR ImageData issues,
 * import from `@/app/components/Refractive.client` instead.
 */
import { refractive } from "@hashintel/refractive";
import { Button } from "@/components/ui/button";
import { withRefractiveFallback } from "./withRefractiveFallback";

export const RefractiveDiv = withRefractiveFallback(
  refractive.div,
  "RefractiveDiv",
);
export const RefractiveSpan = withRefractiveFallback(
  refractive.span,
  "RefractiveSpan",
);
export const RefractiveNav = withRefractiveFallback(
  refractive.nav,
  "RefractiveNav",
);
export const RefractiveButton = withRefractiveFallback(
  refractive(Button),
  "RefractiveButton",
);
